from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.db import get_session
from app.models import Comment, Lead, StatusHistory, User, Video
from app.schemas import LeadDMOpenResponse, LeadDetailRead, LeadHistoryRead, LeadRead, LeadStatusUpdate
from app.services.douyin_collector import DouyinCollectionError, open_profile_dm

router = APIRouter(tags=["leads"])


def _serialize_lead(session: Session, lead: Lead) -> LeadRead:
    user = session.get(User, lead.user_id)
    comment = session.get(Comment, lead.latest_comment_id)
    return LeadRead(
        id=lead.id,
        user_id=lead.user_id,
        user_nickname=user.nickname if user else "",
        platform_user_id=user.platform_user_id if user else "",
        profile_url=user.profile_url if user else None,
        video_id=lead.video_id,
        score=lead.score,
        level=lead.level,
        hit_keywords=[item for item in lead.hit_keywords.split(",") if item],
        reasons=[item for item in lead.reasons.split(" | ") if item],
        source_comment_count=lead.source_comment_count,
        status=lead.status,
        latest_comment_content=comment.content if comment else None,
        last_seen_at=lead.last_seen_at,
    )


def _serialize_lead_detail(session: Session, lead: Lead) -> LeadDetailRead:
    base = _serialize_lead(session, lead)
    comment = session.get(Comment, lead.latest_comment_id)
    video = session.get(Video, lead.video_id)
    history = session.exec(
        select(StatusHistory)
        .where(StatusHistory.lead_id == lead.id)
        .order_by(StatusHistory.created_at.desc())
    ).all()
    return LeadDetailRead(
        **base.model_dump(),
        video_url=video.video_url if video else None,
        video_title=video.title if video else None,
        latest_comment_time=comment.comment_time if comment else None,
        history=[
            LeadHistoryRead(
                from_status=item.from_status,
                to_status=item.to_status,
                note=item.note,
                created_at=item.created_at,
            )
            for item in history
        ],
    )


@router.get("/leads", response_model=list[LeadRead])
def list_leads(
    level: str | None = Query(default=None),
    status: str | None = Query(default=None),
    session: Session = Depends(get_session),
) -> list[LeadRead]:
    statement = select(Lead).order_by(Lead.score.desc(), Lead.last_seen_at.desc())
    if level:
        statement = statement.where(Lead.level == level)
    if status:
        statement = statement.where(Lead.status == status)

    leads = session.exec(statement).all()
    users = {
        user.id: user
        for user in session.exec(select(User).where(User.id.in_([lead.user_id for lead in leads]))).all()
    } if leads else {}
    comments = {
        comment.id: comment
        for comment in session.exec(
            select(Comment).where(Comment.id.in_([lead.latest_comment_id for lead in leads]))
        ).all()
    } if leads else {}

    return [
        LeadRead(
            id=lead.id,
            user_id=lead.user_id,
            user_nickname=users[lead.user_id].nickname if lead.user_id in users else "",
            platform_user_id=users[lead.user_id].platform_user_id if lead.user_id in users else "",
            profile_url=users[lead.user_id].profile_url if lead.user_id in users else None,
            video_id=lead.video_id,
            score=lead.score,
            level=lead.level,
            hit_keywords=[item for item in lead.hit_keywords.split(",") if item],
            reasons=[item for item in lead.reasons.split(" | ") if item],
            source_comment_count=lead.source_comment_count,
            status=lead.status,
            latest_comment_content=comments[lead.latest_comment_id].content if lead.latest_comment_id in comments else None,
            last_seen_at=lead.last_seen_at,
        )
        for lead in leads
    ]


@router.get("/leads/{lead_id}", response_model=LeadDetailRead)
def get_lead_detail(lead_id: int, session: Session = Depends(get_session)) -> LeadDetailRead:
    lead = session.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="lead not found")
    return _serialize_lead_detail(session, lead)


@router.post("/leads/{lead_id}/status", response_model=LeadRead)
def update_lead_status(
    lead_id: int,
    payload: LeadStatusUpdate,
    session: Session = Depends(get_session),
) -> LeadRead:
    lead = session.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="lead not found")

    previous_status = lead.status
    lead.status = payload.status
    session.add(lead)
    session.add(
        StatusHistory(
            lead_id=lead.id,
            from_status=previous_status,
            to_status=payload.status,
            note=payload.note,
        )
    )
    session.commit()
    session.refresh(lead)
    return _serialize_lead(session, lead)


@router.post("/leads/{lead_id}/open-dm", response_model=LeadDMOpenResponse)
def open_lead_dm(lead_id: int, session: Session = Depends(get_session)) -> LeadDMOpenResponse:
    lead = session.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="lead not found")

    user = session.get(User, lead.user_id)
    if not user or not user.profile_url:
        raise HTTPException(status_code=422, detail="该线索没有可用主页链接")

    try:
        result = open_profile_dm(
            user.profile_url,
            auto_connect=True,
            target_name=user.nickname or None,
            message_text="您好",
            send_message=True,
        )
    except DouyinCollectionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return LeadDMOpenResponse(**result)
