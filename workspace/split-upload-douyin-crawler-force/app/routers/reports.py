from fastapi import APIRouter, Depends
from sqlmodel import Session, func, select

from app.db import get_session
from app.models import Comment, Lead, OutreachTask, User, Video
from app.schemas import SummaryReport

router = APIRouter(tags=["reports"])


@router.get("/reports/summary", response_model=SummaryReport)
def summary(session: Session = Depends(get_session)) -> SummaryReport:
    videos = session.exec(select(func.count()).select_from(Video)).one()
    comments = session.exec(select(func.count()).select_from(Comment)).one()
    users = session.exec(select(func.count()).select_from(User)).one()
    leads = session.exec(select(func.count()).select_from(Lead)).one()
    high_intent_leads = session.exec(
        select(func.count()).select_from(Lead).where(Lead.level == "high")
    ).one()
    outreach_tasks = session.exec(select(func.count()).select_from(OutreachTask)).one()
    sent_tasks = session.exec(
        select(func.count()).select_from(OutreachTask).where(OutreachTask.status == "sent")
    ).one()
    return SummaryReport(
        videos=videos,
        comments=comments,
        users=users,
        leads=leads,
        high_intent_leads=high_intent_leads,
        outreach_tasks=outreach_tasks,
        sent_tasks=sent_tasks,
    )
