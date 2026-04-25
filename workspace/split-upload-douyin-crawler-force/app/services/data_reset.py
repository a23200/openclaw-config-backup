from sqlalchemy import delete, update
from sqlmodel import Session, func, select

from app.models import Comment, Lead, OutreachTask, StatusHistory, User, Video


def _count_rows(session: Session, model: type) -> int:
    return session.exec(select(func.count()).select_from(model)).one()


def _clear_comment_related(session: Session) -> dict[str, int]:
    counts = {
        "deleted_tasks": _count_rows(session, OutreachTask),
        "deleted_histories": _count_rows(session, StatusHistory),
        "deleted_leads": _count_rows(session, Lead),
        "deleted_comments": _count_rows(session, Comment),
        "deleted_users": _count_rows(session, User),
    }
    session.exec(delete(OutreachTask))
    session.exec(delete(StatusHistory))
    session.exec(delete(Lead))
    session.exec(delete(Comment))
    session.exec(delete(User))
    return counts


def reset_comment_data(session: Session) -> dict[str, int | str]:
    counts = _clear_comment_related(session)
    reset_result = session.exec(update(Video).values(last_ingested_at=None))
    session.commit()
    return {
        "deleted_videos": 0,
        **counts,
        "reset_video_ingested_at": reset_result.rowcount or 0,
        "detail": "已清空评论、线索、任务和采集状态，视频列表保留。",
    }


def reset_video_data(session: Session) -> dict[str, int | str]:
    counts = _clear_comment_related(session)
    deleted_videos = _count_rows(session, Video)
    session.exec(delete(Video))
    session.commit()
    return {
        "deleted_videos": deleted_videos,
        **counts,
        "reset_video_ingested_at": 0,
        "detail": "已清空视频列表及其相关评论、线索和任务。",
    }
