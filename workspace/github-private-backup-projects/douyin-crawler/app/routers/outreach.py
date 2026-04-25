from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.models import Lead, OutreachTask, StatusHistory, User
from app.schemas import (
    OutreachTaskBatchCreate,
    OutreachTaskBatchCreateResponse,
    OutreachTaskCreate,
    OutreachTaskPrepareResponse,
    OutreachTaskRead,
    OutreachTaskStatusUpdate,
)
from app.services.douyin_collector import DouyinCollectionError, open_profile_dm

router = APIRouter(tags=["outreach"])


def _serialize_task(session: Session, task: OutreachTask) -> OutreachTaskRead:
    lead = session.get(Lead, task.lead_id)
    user = session.get(User, lead.user_id) if lead else None
    return OutreachTaskRead(
        id=task.id,
        lead_id=task.lead_id,
        user_nickname=user.nickname if user else "",
        profile_url=user.profile_url if user else None,
        lead_level=lead.level if lead else None,
        lead_status=lead.status if lead else None,
        template_code=task.template_code,
        message_content=task.message_content,
        delivery_mode=task.delivery_mode,
        status=task.status,
        scheduled_at=task.scheduled_at,
        sent_at=task.sent_at,
        error_message=task.error_message,
        created_at=task.created_at,
    )


def _move_lead_to_working_if_needed(session: Session, lead: Lead) -> None:
    previous_status = lead.status
    if previous_status != "qualified":
        return
    lead.status = "working"
    session.add(lead)
    session.add(
        StatusHistory(
            lead_id=lead.id,
            from_status=previous_status,
            to_status=lead.status,
            note="outreach task created",
        )
    )


def _create_task(
    session: Session,
    *,
    lead: Lead,
    message_content: str,
    template_code: str | None,
    scheduled_at: datetime | None,
) -> OutreachTask:
    task = OutreachTask(
        lead_id=lead.id,
        message_content=message_content,
        template_code=template_code,
        scheduled_at=scheduled_at,
        status="draft",
    )
    session.add(task)
    session.flush()
    _move_lead_to_working_if_needed(session, lead)
    return task


@router.post("/outreach/tasks", response_model=OutreachTaskRead)
def create_outreach_task(
    payload: OutreachTaskCreate,
    session: Session = Depends(get_session),
) -> OutreachTaskRead:
    lead = session.get(Lead, payload.lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="lead not found")

    task = _create_task(
        session,
        lead=lead,
        message_content=payload.message_content,
        template_code=payload.template_code,
        scheduled_at=payload.scheduled_at,
    )
    session.commit()
    session.refresh(task)
    return _serialize_task(session, task)


@router.post("/outreach/tasks/batch-create", response_model=OutreachTaskBatchCreateResponse)
def batch_create_outreach_tasks(
    payload: OutreachTaskBatchCreate,
    session: Session = Depends(get_session),
) -> OutreachTaskBatchCreateResponse:
    normalized_lead_ids = list(dict.fromkeys(payload.lead_ids))
    created_tasks: list[OutreachTask] = []
    missing_lead_ids: list[int] = []

    for lead_id in normalized_lead_ids:
        lead = session.get(Lead, lead_id)
        if not lead:
            missing_lead_ids.append(lead_id)
            continue
        created_tasks.append(
            _create_task(
                session,
                lead=lead,
                message_content=payload.message_content,
                template_code=payload.template_code,
                scheduled_at=payload.scheduled_at,
            )
        )

    session.commit()
    for task in created_tasks:
        session.refresh(task)

    return OutreachTaskBatchCreateResponse(
        requested_count=len(normalized_lead_ids),
        created_count=len(created_tasks),
        missing_lead_ids=missing_lead_ids,
        task_ids=[task.id for task in created_tasks if task.id is not None],
        tasks=[_serialize_task(session, task) for task in created_tasks],
    )


@router.get("/outreach/tasks", response_model=list[OutreachTaskRead])
def list_outreach_tasks(session: Session = Depends(get_session)) -> list[OutreachTaskRead]:
    tasks = session.exec(select(OutreachTask).order_by(OutreachTask.created_at.desc())).all()
    return [_serialize_task(session, task) for task in tasks]


@router.post("/outreach/tasks/{task_id}/prepare", response_model=OutreachTaskPrepareResponse)
def prepare_outreach_task(
    task_id: int,
    session: Session = Depends(get_session),
) -> OutreachTaskPrepareResponse:
    task = session.get(OutreachTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")

    if task.status == "sent":
        return OutreachTaskPrepareResponse(
            success=False,
            task=_serialize_task(session, task),
            detail="该任务已标记为 sent，无需再次执行。",
        )

    lead = session.get(Lead, task.lead_id)
    user = session.get(User, lead.user_id) if lead else None
    if not lead or not user or not user.profile_url:
        task.status = "failed"
        task.error_message = "该任务对应线索没有可用主页链接"
        session.add(task)
        session.commit()
        session.refresh(task)
        return OutreachTaskPrepareResponse(
            success=False,
            task=_serialize_task(session, task),
            detail=task.error_message,
        )

    try:
        result = open_profile_dm(
            user.profile_url,
            auto_connect=True,
            target_name=user.nickname or None,
            message_text=task.message_content,
            send_message=False,
        )
        success = bool(result.get("opened") and result.get("filled"))
        task.status = "prepared" if success else "failed"
        task.error_message = None if success else result.get("detail")
    except DouyinCollectionError as exc:
        result = {
            "opened": False,
            "filled": False,
            "sent": False,
            "target_name": user.nickname or "",
            "profile_url": user.profile_url,
            "current_url": user.profile_url,
            "detail": str(exc),
        }
        task.status = "failed"
        task.error_message = str(exc)

    session.add(task)
    session.commit()
    session.refresh(task)
    return OutreachTaskPrepareResponse(
        success=task.status == "prepared",
        task=_serialize_task(session, task),
        opened=bool(result.get("opened")),
        filled=bool(result.get("filled")),
        sent=bool(result.get("sent")),
        target_name=str(result.get("target_name") or ""),
        profile_url=str(result.get("profile_url") or user.profile_url or ""),
        current_url=str(result.get("current_url") or user.profile_url or ""),
        detail=str(result.get("detail") or ""),
    )


@router.post("/outreach/tasks/{task_id}/status", response_model=OutreachTaskRead)
def update_outreach_task_status(
    task_id: int,
    payload: OutreachTaskStatusUpdate,
    session: Session = Depends(get_session),
) -> OutreachTaskRead:
    task = session.get(OutreachTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")

    task.status = payload.status
    task.error_message = payload.error_message
    if payload.status == "sent":
        task.sent_at = datetime.now(timezone.utc)

    lead = session.get(Lead, task.lead_id)
    if lead:
        previous_status = lead.status
        if payload.status == "sent":
            lead.status = "contacted"
        elif payload.status == "failed":
            lead.status = "followup_needed"
        if previous_status != lead.status:
            session.add(
                StatusHistory(
                    lead_id=lead.id,
                    from_status=previous_status,
                    to_status=lead.status,
                    note=f"outreach task status changed to {payload.status}",
                )
            )
            session.add(lead)

    session.add(task)
    session.commit()
    session.refresh(task)
    return _serialize_task(session, task)
