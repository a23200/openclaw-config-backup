from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from application.engine.services.autopilot_daemon import AutopilotDaemon
from domain.novel.entities.novel import AutopilotStatus, Novel, NovelStage
from domain.novel.value_objects.novel_id import NovelId


def _node(kind, number, *, node_id=None, parent_id=None, suggested_chapter_count=None):
    return SimpleNamespace(
        id=node_id or f"{kind}-{number}",
        novel_id="novel-1",
        parent_id=parent_id,
        node_type=SimpleNamespace(value=kind),
        number=number,
        title=f"{kind}-{number}",
        description="",
        outline="",
        suggested_chapter_count=suggested_chapter_count,
        order_index=number,
    )


@pytest.mark.asyncio
async def test_act_planning_recovers_drifted_act_pointer_and_extends_last_act():
    novel = Novel(
        id=NovelId("novel-1"),
        title="测试小说",
        author="作者",
        target_chapters=1000,
        autopilot_status=AutopilotStatus.RUNNING,
        auto_approve_mode=True,
        current_stage=NovelStage.ACT_PLANNING,
        current_act=1300,
        current_auto_chapters=600,
    )

    volumes = [_node("volume", i, node_id=f"volume-{i}") for i in range(1, 13)]
    act_148 = _node("act", 148, node_id="act-148", parent_id="volume-12")
    act_149 = _node("act", 149, node_id="act-149", parent_id="volume-12", suggested_chapter_count=3)
    chapter_601 = _node("chapter", 601, node_id="chapter-601", parent_id="act-149")

    story_node_repo = Mock()
    story_node_repo.get_by_novel = AsyncMock(
        side_effect=[
            volumes + [act_148],
            volumes + [act_148, act_149],
        ]
    )
    story_node_repo.get_children_sync = Mock(side_effect=[[], [chapter_601]])

    planning_service = Mock()
    planning_service.create_next_act_auto = AsyncMock(return_value={"success": True})
    planning_service.plan_act_chapters = AsyncMock(
        return_value={"chapters": [{"title": "第601章", "outline": "继续推进剧情"}]}
    )
    planning_service.confirm_act_planning = AsyncMock(return_value={"success": True})

    daemon = AutopilotDaemon(
        novel_repository=Mock(),
        llm_service=Mock(),
        context_builder=None,
        background_task_service=Mock(),
        planning_service=planning_service,
        story_node_repo=story_node_repo,
        chapter_repository=Mock(),
    )
    daemon._is_still_running = Mock(return_value=True)
    daemon._flush_novel = Mock()

    await daemon._handle_act_planning(novel)

    planning_service.create_next_act_auto.assert_awaited_once_with(
        novel_id="novel-1",
        current_act_id="act-148",
    )
    assert novel.current_act == 148
    assert novel.current_stage == NovelStage.WRITING


def test_save_novel_state_does_not_overwrite_manual_stop():
    novel = Novel(
        id=NovelId("novel-1"),
        title="测试小说",
        author="作者",
        target_chapters=100,
        autopilot_status=AutopilotStatus.RUNNING,
        current_stage=NovelStage.WRITING,
    )

    repo = Mock()
    repo.save_if_autopilot_status = Mock(return_value=False)
    repo.save = Mock()

    daemon = AutopilotDaemon(
        novel_repository=repo,
        llm_service=Mock(),
        context_builder=None,
        background_task_service=Mock(),
        planning_service=Mock(),
        story_node_repo=Mock(),
        chapter_repository=Mock(),
    )
    daemon._read_autopilot_status_ephemeral = Mock(return_value=AutopilotStatus.STOPPED)

    daemon._save_novel_state(novel)

    repo.save_if_autopilot_status.assert_called_once_with(novel, AutopilotStatus.RUNNING.value)
    repo.save.assert_not_called()
    assert novel.autopilot_status == AutopilotStatus.STOPPED
