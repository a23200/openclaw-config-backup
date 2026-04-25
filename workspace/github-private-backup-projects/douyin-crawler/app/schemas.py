from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class VideoCreate(BaseModel):
    platform_video_id: str = Field(min_length=1)
    video_url: str = Field(min_length=1)
    title: str = ""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "platform_video_id": "7490050011223344556",
                "video_url": "https://www.douyin.com/video/7490050011223344556",
                "title": "创业副业案例视频",
            }
        }
    )


class VideoRead(BaseModel):
    id: int
    platform_video_id: str
    video_url: str
    title: str
    status: str
    created_at: datetime
    last_ingested_at: Optional[datetime] = None


class DataResetResponse(BaseModel):
    deleted_videos: int = 0
    deleted_comments: int = 0
    deleted_leads: int = 0
    deleted_tasks: int = 0
    deleted_histories: int = 0
    deleted_users: int = 0
    reset_video_ingested_at: int = 0
    detail: str


class DouyinVideoDiscoveryRequest(BaseModel):
    keywords: list[str] = Field(default_factory=list)
    max_keywords: int = Field(default=3, ge=1, le=10)
    max_videos_per_keyword: int = Field(default=8, ge=1, le=30)
    sort_by: str = Field(default="comprehensive")
    publish_time: str = Field(default="all")
    video_duration: str = Field(default="all")
    search_scope: str = Field(default="all")
    auto_connect: bool = True
    persist_videos: bool = True

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "keywords": ["副业", "创业", "兼职"],
                "max_keywords": 3,
                "max_videos_per_keyword": 8,
                "sort_by": "latest",
                "publish_time": "week",
                "video_duration": "all",
                "search_scope": "all",
                "auto_connect": True,
                "persist_videos": True,
            }
        }
    )


class DiscoveredVideoRead(BaseModel):
    keyword: str
    platform_video_id: str
    video_url: str
    title: str = ""
    saved: bool = False
    video_id: Optional[int] = None


class DouyinVideoDiscoveryResponse(BaseModel):
    keywords: list[str]
    sort_by: str
    publish_time: str
    video_duration: str
    search_scope: str
    discovered_count: int
    created_videos: int
    existing_videos: int
    videos: list[DiscoveredVideoRead]


class CommentAuthorInput(BaseModel):
    platform_user_id: str = Field(min_length=1)
    nickname: str = ""
    profile_url: Optional[str] = None
    bio: Optional[str] = None
    province: Optional[str] = None
    city: Optional[str] = None
    follower_count: int = 0
    following_count: int = 0
    liked_count: int = 0

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "platform_user_id": "user_10001",
                "nickname": "想做副业的小王",
                "profile_url": "https://www.douyin.com/user/user_10001",
                "bio": "杭州 | 电商创业",
                "province": "浙江",
                "city": "杭州",
                "follower_count": 120,
                "following_count": 88,
                "liked_count": 3500,
            }
        }
    )


class CommentInput(BaseModel):
    platform_comment_id: str = Field(min_length=1)
    content: str = Field(min_length=1)
    like_count: int = 0
    reply_count: int = 0
    comment_time: datetime
    author: CommentAuthorInput

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "platform_comment_id": "comment_90001",
                "content": "这个怎么联系？多少钱？",
                "like_count": 12,
                "reply_count": 2,
                "comment_time": "2026-04-10T10:20:00+08:00",
                "author": {
                    "platform_user_id": "user_10001",
                    "nickname": "想做副业的小王",
                    "profile_url": "https://www.douyin.com/user/user_10001",
                    "bio": "杭州 | 电商创业",
                    "province": "浙江",
                    "city": "杭州",
                    "follower_count": 120,
                    "following_count": 88,
                    "liked_count": 3500,
                },
            }
        }
    )


class CommentImportRequest(BaseModel):
    video_id: int
    comments: list[CommentInput]

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "video_id": 1,
                "comments": [
                    {
                        "platform_comment_id": "comment_90001",
                        "content": "这个怎么联系？多少钱？",
                        "like_count": 12,
                        "reply_count": 2,
                        "comment_time": "2026-04-10T10:20:00+08:00",
                        "author": {
                            "platform_user_id": "user_10001",
                            "nickname": "想做副业的小王",
                            "profile_url": "https://www.douyin.com/user/user_10001",
                            "bio": "杭州 | 电商创业",
                            "province": "浙江",
                            "city": "杭州",
                            "follower_count": 120,
                            "following_count": 88,
                            "liked_count": 3500,
                        },
                    },
                    {
                        "platform_comment_id": "comment_90002",
                        "content": "效果怎么样？新手能做吗？",
                        "like_count": 6,
                        "reply_count": 1,
                        "comment_time": "2026-04-10T10:30:00+08:00",
                        "author": {
                            "platform_user_id": "user_10002",
                            "nickname": "阿浩",
                            "profile_url": "https://www.douyin.com/user/user_10002",
                            "bio": "广州 | 自由职业",
                            "province": "广东",
                            "city": "广州",
                            "follower_count": 60,
                            "following_count": 140,
                            "liked_count": 1800,
                        },
                    },
                ],
            }
        }
    )


class CommentImportResponse(BaseModel):
    total: int
    created_comments: int
    updated_comments: int
    created_leads: int
    updated_leads: int


class LeadRead(BaseModel):
    id: int
    user_id: int
    user_nickname: str
    platform_user_id: str
    profile_url: Optional[str] = None
    video_id: int
    score: int
    level: str
    hit_keywords: list[str]
    reasons: list[str]
    source_comment_count: int
    status: str
    latest_comment_content: Optional[str] = None
    last_seen_at: datetime


class LeadHistoryRead(BaseModel):
    from_status: Optional[str] = None
    to_status: str
    note: Optional[str] = None
    created_at: datetime


class LeadDetailRead(LeadRead):
    video_url: Optional[str] = None
    video_title: Optional[str] = None
    latest_comment_time: Optional[datetime] = None
    history: list[LeadHistoryRead]


class LeadStatusUpdate(BaseModel):
    status: str = Field(min_length=1)
    note: Optional[str] = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "status": "working",
                "note": "已进入跟进池",
            }
        }
    )


class LeadDMOpenResponse(BaseModel):
    opened: bool
    filled: bool = False
    sent: bool = False
    target_name: str = ""
    profile_url: str
    current_url: str
    detail: str


class OutreachTaskCreate(BaseModel):
    lead_id: int
    message_content: str = Field(min_length=1)
    template_code: Optional[str] = None
    scheduled_at: Optional[datetime] = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "lead_id": 1,
                "message_content": "你好，看到你对这个项目感兴趣，我整理了一份介绍，可以发你看看。",
                "template_code": "intro_v1",
                "scheduled_at": "2026-04-10T11:00:00+08:00",
            }
        }
    )


class OutreachTaskBatchCreate(BaseModel):
    lead_ids: list[int] = Field(min_length=1)
    message_content: str = Field(min_length=1)
    template_code: Optional[str] = None
    scheduled_at: Optional[datetime] = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "lead_ids": [1, 2, 3],
                "message_content": "您好",
                "template_code": "hello_v1",
                "scheduled_at": None,
            }
        }
    )


class OutreachTaskRead(BaseModel):
    id: int
    lead_id: int
    user_nickname: str = ""
    profile_url: Optional[str] = None
    lead_level: Optional[str] = None
    lead_status: Optional[str] = None
    template_code: Optional[str]
    message_content: str
    delivery_mode: str
    status: str
    scheduled_at: Optional[datetime]
    sent_at: Optional[datetime]
    error_message: Optional[str]
    created_at: datetime


class OutreachTaskBatchCreateResponse(BaseModel):
    requested_count: int
    created_count: int
    missing_lead_ids: list[int] = Field(default_factory=list)
    task_ids: list[int] = Field(default_factory=list)
    tasks: list[OutreachTaskRead] = Field(default_factory=list)


class OutreachTaskStatusUpdate(BaseModel):
    status: str = Field(min_length=1)
    error_message: Optional[str] = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "status": "sent",
                "error_message": None,
            }
        }
    )


class OutreachTaskPrepareResponse(BaseModel):
    success: bool
    task: OutreachTaskRead
    opened: bool = False
    filled: bool = False
    sent: bool = False
    target_name: str = ""
    profile_url: str = ""
    current_url: str = ""
    detail: str


class SummaryReport(BaseModel):
    videos: int
    comments: int
    users: int
    leads: int
    high_intent_leads: int
    outreach_tasks: int
    sent_tasks: int


class DouyinCollectRequest(BaseModel):
    video_url: str = Field(min_length=1)
    max_scrolls: int = Field(default=8, ge=0, le=120)
    max_comments: int = Field(default=80, ge=1, le=1000)
    min_level: str = Field(default="medium")
    rule_keywords: list[str] = Field(default_factory=list)
    auto_connect: bool = True

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "video_url": "https://www.douyin.com/video/7490050011223344556",
                "max_scrolls": 8,
                "max_comments": 80,
                "min_level": "medium",
                "rule_keywords": ["价格", "联系方式", "新手"],
                "auto_connect": True,
            }
        }
    )


class DouyinCollectResponse(BaseModel):
    video_id: int
    platform_video_id: str
    video_url: str
    page_title: str
    collected_count: int
    raw_collected_count: int
    filtered_out_count: int
    min_level: str
    rule_keywords: list[str]
    imported: CommentImportResponse
    sample_profiles: list[str]
    body_snippet: str


class DouyinBatchCollectRequest(BaseModel):
    video_ids: list[int] = Field(default_factory=list)
    limit: int = Field(default=5, ge=1, le=30)
    only_uningested: bool = True
    max_scrolls: int = Field(default=8, ge=0, le=120)
    max_comments: int = Field(default=80, ge=1, le=1000)
    min_level: str = Field(default="medium")
    rule_keywords: list[str] = Field(default_factory=list)
    auto_connect: bool = True

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "video_ids": [4, 5, 6],
                "limit": 5,
                "only_uningested": True,
                "max_scrolls": 8,
                "max_comments": 80,
                "min_level": "medium",
                "rule_keywords": ["价格", "联系方式", "新手"],
                "auto_connect": True,
            }
        }
    )


class DouyinBatchCollectItem(BaseModel):
    video_id: Optional[int] = None
    platform_video_id: str = ""
    video_url: str
    page_title: str = ""
    collected_count: int = 0
    raw_collected_count: int = 0
    filtered_out_count: int = 0
    created_leads: int = 0
    success: bool
    detail: str


class DouyinBatchCollectResponse(BaseModel):
    requested_count: int
    success_count: int
    failed_count: int
    total_comments: int
    total_created_leads: int
    results: list[DouyinBatchCollectItem]
