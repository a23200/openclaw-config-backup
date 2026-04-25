from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from datetime import datetime, timezone

from app.db import get_session
from app.models import Video
from app.schemas import (
    CommentImportResponse,
    DouyinBatchCollectItem,
    DouyinBatchCollectRequest,
    DouyinBatchCollectResponse,
    DiscoveredVideoRead,
    DouyinCollectRequest,
    DouyinCollectResponse,
    DouyinVideoDiscoveryRequest,
    DouyinVideoDiscoveryResponse,
)
from app.services.comment_ingestion import ingest_comments
from app.services.douyin_collector import (
    DouyinCollectionError,
    collect_video_comments,
    discover_videos_by_keywords,
    extract_video_identifier,
    normalize_comments_for_ingestion,
)
from app.services.lead_scoring import matches_min_level, normalize_min_level, score_comment

router = APIRouter(tags=["douyin"])


def _collect_comments_for_video(
    session: Session,
    *,
    video_url: str,
    max_scrolls: int,
    max_comments: int,
    min_level: str,
    rule_keywords: list[str],
    auto_connect: bool,
) -> DouyinCollectResponse:
    collected = collect_video_comments(
        video_url,
        max_scrolls=max_scrolls,
        max_comments=max_comments,
        auto_connect=auto_connect,
    )

    raw_comments = collected["comments"]
    if not raw_comments:
        raise DouyinCollectionError(
            "没有抓到可见评论；请先在本机浏览器登录霸霸并确保视频页评论区已可见。"
        )

    canonical_video_url = collected["page_url"] or video_url
    platform_video_id = extract_video_identifier(canonical_video_url)
    video = session.exec(
        select(Video).where(Video.platform_video_id == platform_video_id)
    ).first()
    if not video:
        video = Video(
            platform_video_id=platform_video_id,
            video_url=canonical_video_url,
            title=collected["page_title"],
        )
        session.add(video)
        session.commit()
        session.refresh(video)
    else:
        video.video_url = canonical_video_url
        video.title = collected["page_title"] or video.title
        session.add(video)
        session.commit()
        session.refresh(video)

    normalized_min_level = normalize_min_level(min_level)
    filtered_raw_comments = [
        item
        for item in raw_comments
        if matches_min_level(
            score_comment(item.get("content") or "", custom_keywords=rule_keywords).level,
            normalized_min_level,
        )
    ]
    comments = normalize_comments_for_ingestion(filtered_raw_comments)
    filtered_out_count = max(len(raw_comments) - len(comments), 0)

    if comments:
        result = ingest_comments(session, video, comments, custom_keywords=rule_keywords)
    else:
        video.last_ingested_at = datetime.now(timezone.utc)
        session.add(video)
        session.commit()
        session.refresh(video)
        result = CommentImportResponse(
            total=0,
            created_comments=0,
            updated_comments=0,
            created_leads=0,
            updated_leads=0,
        )

    return DouyinCollectResponse(
        video_id=video.id,
        platform_video_id=video.platform_video_id,
        video_url=video.video_url,
        page_title=collected["page_title"],
        collected_count=len(comments),
        raw_collected_count=len(raw_comments),
        filtered_out_count=filtered_out_count,
        min_level=normalized_min_level,
        rule_keywords=rule_keywords,
        imported=result,
        sample_profiles=[
            comment.author.profile_url
            for comment in comments[:5]
            if comment.author.profile_url
        ] or [item.get("profile_url") for item in raw_comments[:5] if item.get("profile_url")],
        body_snippet=collected["body_snippet"],
    )


@router.post("/douyin/discover/videos", response_model=DouyinVideoDiscoveryResponse)
def discover_douyin_videos(
    payload: DouyinVideoDiscoveryRequest,
    session: Session = Depends(get_session),
) -> DouyinVideoDiscoveryResponse:
    try:
        discovered = discover_videos_by_keywords(
            payload.keywords,
            max_keywords=payload.max_keywords,
            max_videos_per_keyword=payload.max_videos_per_keyword,
            sort_by=payload.sort_by,
            publish_time=payload.publish_time,
            video_duration=payload.video_duration,
            search_scope=payload.search_scope,
            auto_connect=payload.auto_connect,
        )
    except DouyinCollectionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    created_videos = 0
    existing_videos = 0
    rows: list[DiscoveredVideoRead] = []

    for item in discovered["videos"]:
        existing = session.exec(
            select(Video).where(Video.platform_video_id == item["platform_video_id"])
        ).first()

        saved = False
        video_id = None
        if payload.persist_videos:
            if existing:
                existing.video_url = item["video_url"] or existing.video_url
                existing.title = item["title"] or existing.title
                session.add(existing)
                session.commit()
                session.refresh(existing)
                existing_videos += 1
                saved = True
                video_id = existing.id
            else:
                video = Video(
                    platform_video_id=item["platform_video_id"],
                    video_url=item["video_url"],
                    title=item["title"],
                )
                session.add(video)
                session.commit()
                session.refresh(video)
                created_videos += 1
                saved = True
                video_id = video.id

        rows.append(
            DiscoveredVideoRead(
                keyword=item["keyword"],
                platform_video_id=item["platform_video_id"],
                video_url=item["video_url"],
                title=item["title"],
                saved=saved,
                video_id=video_id,
            )
        )

    return DouyinVideoDiscoveryResponse(
        keywords=discovered["keywords"],
        sort_by=discovered["sort_by"],
        publish_time=discovered["publish_time"],
        video_duration=discovered["video_duration"],
        search_scope=discovered["search_scope"],
        discovered_count=len(rows),
        created_videos=created_videos,
        existing_videos=existing_videos,
        videos=rows,
    )


@router.post("/douyin/collect/comments/batch", response_model=DouyinBatchCollectResponse)
def collect_douyin_comments_batch(
    payload: DouyinBatchCollectRequest,
    session: Session = Depends(get_session),
) -> DouyinBatchCollectResponse:
    if payload.video_ids:
        videos = [
            video
            for video in (session.get(Video, video_id) for video_id in payload.video_ids)
            if video and video.video_url
        ]
    else:
        query = select(Video).order_by(Video.created_at.desc())
        if payload.only_uningested:
            query = query.where(Video.last_ingested_at.is_(None))
        videos = list(session.exec(query.limit(payload.limit)).all())

    results: list[DouyinBatchCollectItem] = []
    total_comments = 0
    total_created_leads = 0
    success_count = 0

    for video in videos[: payload.limit]:
        if not video.video_url:
            results.append(
                DouyinBatchCollectItem(
                    video_id=video.id,
                    platform_video_id=video.platform_video_id,
                    video_url="",
                    page_title=video.title or "",
                    success=False,
                    detail="该视频没有可用链接",
                )
            )
            continue

        try:
            result = _collect_comments_for_video(
                session,
                video_url=video.video_url,
                max_scrolls=payload.max_scrolls,
                max_comments=payload.max_comments,
                min_level=payload.min_level,
                rule_keywords=payload.rule_keywords,
                auto_connect=payload.auto_connect,
            )
        except DouyinCollectionError as exc:
            results.append(
                DouyinBatchCollectItem(
                    video_id=video.id,
                    platform_video_id=video.platform_video_id,
                    video_url=video.video_url,
                    page_title=video.title or "",
                    raw_collected_count=0,
                    filtered_out_count=0,
                    success=False,
                    detail=str(exc),
                )
            )
            continue

        success_count += 1
        total_comments += result.collected_count
        total_created_leads += result.imported.created_leads
        results.append(
            DouyinBatchCollectItem(
                video_id=result.video_id,
                platform_video_id=result.platform_video_id,
                video_url=result.video_url,
                page_title=result.page_title,
                collected_count=result.collected_count,
                raw_collected_count=result.raw_collected_count,
                filtered_out_count=result.filtered_out_count,
                created_leads=result.imported.created_leads,
                success=True,
                detail=f"原始 {result.raw_collected_count} 条，保留 {result.collected_count} 条，新增线索 {result.imported.created_leads} 条",
            )
        )

    return DouyinBatchCollectResponse(
        requested_count=min(len(videos), payload.limit),
        success_count=success_count,
        failed_count=max(min(len(videos), payload.limit) - success_count, 0),
        total_comments=total_comments,
        total_created_leads=total_created_leads,
        results=results,
    )


@router.post("/douyin/collect/comments", response_model=DouyinCollectResponse)
def collect_douyin_comments(
    payload: DouyinCollectRequest,
    session: Session = Depends(get_session),
) -> DouyinCollectResponse:
    try:
        return _collect_comments_for_video(
            session,
            video_url=payload.video_url,
            max_scrolls=payload.max_scrolls,
            max_comments=payload.max_comments,
            min_level=payload.min_level,
            rule_keywords=payload.rule_keywords,
            auto_connect=payload.auto_connect,
        )
    except DouyinCollectionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
