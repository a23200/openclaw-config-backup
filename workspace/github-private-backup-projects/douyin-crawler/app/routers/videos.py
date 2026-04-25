from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.models import Video
from app.schemas import DataResetResponse, VideoCreate, VideoRead
from app.services.data_reset import reset_video_data

router = APIRouter(tags=["videos"])


@router.post("/videos", response_model=VideoRead)
def create_video(payload: VideoCreate, session: Session = Depends(get_session)) -> Video:
    existing = session.exec(
        select(Video).where(Video.platform_video_id == payload.platform_video_id)
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="video already exists")

    video = Video(
        platform_video_id=payload.platform_video_id,
        video_url=payload.video_url,
        title=payload.title,
    )
    session.add(video)
    session.commit()
    session.refresh(video)
    return video


@router.get("/videos", response_model=list[VideoRead])
def list_videos(session: Session = Depends(get_session)) -> list[Video]:
    return list(session.exec(select(Video).order_by(Video.created_at.desc())).all())


@router.delete("/videos/reset", response_model=DataResetResponse)
def clear_videos(session: Session = Depends(get_session)) -> DataResetResponse:
    return DataResetResponse(**reset_video_data(session))
