from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.db import get_session
from app.models import Video
from app.schemas import CommentImportRequest, CommentImportResponse, DataResetResponse
from app.services.comment_ingestion import ingest_comments
from app.services.data_reset import reset_comment_data

router = APIRouter(tags=["comments"])


@router.post("/comments/import", response_model=CommentImportResponse)
def import_comments(
    payload: CommentImportRequest, session: Session = Depends(get_session)
) -> CommentImportResponse:
    video = session.get(Video, payload.video_id)
    if not video:
        raise HTTPException(status_code=404, detail="video not found")
    return ingest_comments(session, video, payload.comments)


@router.delete("/comments/reset", response_model=DataResetResponse)
def clear_comments(session: Session = Depends(get_session)) -> DataResetResponse:
    return DataResetResponse(**reset_comment_data(session))
