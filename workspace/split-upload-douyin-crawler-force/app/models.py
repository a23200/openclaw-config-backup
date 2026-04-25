from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Video(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    platform_video_id: str = Field(index=True, unique=True)
    video_url: str
    title: str = ""
    status: str = Field(default="active", index=True)
    created_at: datetime = Field(default_factory=utc_now)
    last_ingested_at: Optional[datetime] = None


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    platform_user_id: str = Field(index=True, unique=True)
    nickname: str = ""
    profile_url: Optional[str] = None
    bio: Optional[str] = None
    province: Optional[str] = None
    city: Optional[str] = None
    follower_count: int = 0
    following_count: int = 0
    liked_count: int = 0
    created_at: datetime = Field(default_factory=utc_now)
    last_seen_at: datetime = Field(default_factory=utc_now)


class Comment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    platform_comment_id: str = Field(index=True, unique=True)
    video_id: int = Field(foreign_key="video.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    content: str
    like_count: int = 0
    reply_count: int = 0
    comment_time: datetime
    collected_at: datetime = Field(default_factory=utc_now)


class Lead(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("user_id", "video_id", name="uq_lead_user_video"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    video_id: int = Field(foreign_key="video.id", index=True)
    latest_comment_id: int = Field(foreign_key="comment.id")
    score: int = Field(default=0, index=True)
    level: str = Field(default="low", index=True)
    hit_keywords: str = ""
    reasons: str = ""
    source_comment_count: int = 1
    status: str = Field(default="new", index=True)
    first_seen_at: datetime = Field(default_factory=utc_now)
    last_seen_at: datetime = Field(default_factory=utc_now)


class OutreachTask(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    lead_id: int = Field(foreign_key="lead.id", index=True)
    template_code: Optional[str] = None
    message_content: str
    delivery_mode: str = Field(default="manual")
    status: str = Field(default="draft", index=True)
    scheduled_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)


class StatusHistory(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    lead_id: int = Field(foreign_key="lead.id", index=True)
    from_status: Optional[str] = None
    to_status: str = Field(index=True)
    note: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)
