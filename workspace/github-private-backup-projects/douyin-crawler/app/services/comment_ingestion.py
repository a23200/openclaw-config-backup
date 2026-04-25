from datetime import timezone

from sqlmodel import Session, select

from app.models import Comment, Lead, StatusHistory, User, Video
from app.schemas import CommentImportResponse, CommentInput
from app.services.lead_scoring import score_comment


def _merge_csv(existing: str, additions: list[str]) -> str:
    combined = {item for item in existing.split(",") if item}
    combined.update(additions)
    return ",".join(sorted(combined))


def _derive_status(level: str) -> str:
    return "qualified" if level == "high" else "new"


def ingest_comments(
    session: Session,
    video: Video,
    comments: list[CommentInput],
    *,
    custom_keywords: list[str] | None = None,
) -> CommentImportResponse:
    created_comments = 0
    updated_comments = 0
    created_leads = 0
    updated_leads = 0

    for item in comments:
        author = session.exec(
            select(User).where(User.platform_user_id == item.author.platform_user_id)
        ).first()
        if not author:
            author = User(
                platform_user_id=item.author.platform_user_id,
                nickname=item.author.nickname,
                profile_url=item.author.profile_url,
                bio=item.author.bio,
                province=item.author.province,
                city=item.author.city,
                follower_count=item.author.follower_count,
                following_count=item.author.following_count,
                liked_count=item.author.liked_count,
                last_seen_at=item.comment_time.astimezone(timezone.utc),
            )
            session.add(author)
            session.flush()
        else:
            author.nickname = item.author.nickname or author.nickname
            author.profile_url = item.author.profile_url or author.profile_url
            author.bio = item.author.bio or author.bio
            author.province = item.author.province or author.province
            author.city = item.author.city or author.city
            author.follower_count = item.author.follower_count
            author.following_count = item.author.following_count
            author.liked_count = item.author.liked_count
            author.last_seen_at = item.comment_time.astimezone(timezone.utc)

        comment = session.exec(
            select(Comment).where(Comment.platform_comment_id == item.platform_comment_id)
        ).first()
        is_new_comment = comment is None
        if not comment:
            comment = Comment(
                platform_comment_id=item.platform_comment_id,
                video_id=video.id,
                user_id=author.id,
                content=item.content,
                like_count=item.like_count,
                reply_count=item.reply_count,
                comment_time=item.comment_time.astimezone(timezone.utc),
            )
            session.add(comment)
            session.flush()
            created_comments += 1
        else:
            comment.content = item.content
            comment.like_count = item.like_count
            comment.reply_count = item.reply_count
            comment.comment_time = item.comment_time.astimezone(timezone.utc)
            updated_comments += 1

        result = score_comment(item.content, custom_keywords=custom_keywords)
        lead = session.exec(
            select(Lead).where(Lead.user_id == author.id, Lead.video_id == video.id)
        ).first()
        if not lead:
            lead = Lead(
                user_id=author.id,
                video_id=video.id,
                latest_comment_id=comment.id,
                score=result.score,
                level=result.level,
                hit_keywords=",".join(result.hit_keywords),
                reasons=" | ".join(result.reasons),
                source_comment_count=1,
                status=_derive_status(result.level),
                first_seen_at=item.comment_time.astimezone(timezone.utc),
                last_seen_at=item.comment_time.astimezone(timezone.utc),
            )
            session.add(lead)
            session.flush()
            session.add(
                StatusHistory(
                    lead_id=lead.id,
                    from_status=None,
                    to_status=lead.status,
                    note="lead created from imported comment",
                )
            )
            created_leads += 1
        else:
            previous_status = lead.status
            previous_score = lead.score
            lead.latest_comment_id = comment.id
            lead.score = max(lead.score, result.score)
            if result.score >= previous_score:
                lead.level = result.level
            lead.hit_keywords = _merge_csv(lead.hit_keywords, result.hit_keywords)
            lead.reasons = " | ".join(
                sorted(set([reason for reason in lead.reasons.split(" | ") if reason] + result.reasons))
            )
            if is_new_comment:
                lead.source_comment_count += 1
            lead.last_seen_at = item.comment_time.astimezone(timezone.utc)
            next_status = _derive_status(lead.level)
            if previous_status != next_status:
                lead.status = next_status
                session.add(
                    StatusHistory(
                        lead_id=lead.id,
                        from_status=previous_status,
                        to_status=next_status,
                        note="lead status updated by rescoring",
                    )
                )
            updated_leads += 1

    if comments:
        video.last_ingested_at = max(
            item.comment_time.astimezone(timezone.utc) for item in comments
        )
    session.add(video)
    session.commit()

    return CommentImportResponse(
        total=len(comments),
        created_comments=created_comments,
        updated_comments=updated_comments,
        created_leads=created_leads,
        updated_leads=updated_leads,
    )
