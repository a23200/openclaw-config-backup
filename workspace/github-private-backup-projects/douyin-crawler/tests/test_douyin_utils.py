import unittest
from unittest.mock import patch

from app.services import douyin_collector
from app.services.douyin_collector import (
    _count_message_occurrences,
    _dm_names_match,
    _dm_send_confirmed,
    _normalize_dm_name,
    build_comment_identifier,
    extract_video_identifier,
    open_profile_dm,
    normalize_discovery_publish_time,
    normalize_discovery_search_scope,
    normalize_discovery_sort,
    normalize_discovery_video_duration,
    parse_compact_count,
)


class DouyinUtilsTests(unittest.TestCase):
    def test_extract_video_identifier_from_video_url(self) -> None:
        self.assertEqual(
            extract_video_identifier("https://www.douyin.com/video/7490050011223344556"),
            "7490050011223344556",
        )

    def test_build_comment_identifier_is_stable(self) -> None:
        first = build_comment_identifier("7490", "https://www.douyin.com/user/abc", "你好")
        second = build_comment_identifier("7490", "https://www.douyin.com/user/abc", "你好")
        self.assertEqual(first, second)

    def test_parse_compact_count(self) -> None:
        self.assertEqual(parse_compact_count("12"), 12)
        self.assertEqual(parse_compact_count("1.2w"), 12000)
        self.assertEqual(parse_compact_count("3万"), 30000)

    def test_normalize_discovery_filters(self) -> None:
        self.assertEqual(normalize_discovery_sort("最新发布"), "latest")
        self.assertEqual(normalize_discovery_publish_time("一周内"), "week")
        self.assertEqual(normalize_discovery_video_duration("1-5分钟"), "between_1m_5m")
        self.assertEqual(normalize_discovery_search_scope("最近看过"), "recent")

    def test_count_message_occurrences(self) -> None:
        self.assertEqual(_count_message_occurrences("您好\n您好\n你好", "您好"), 2)

    def test_normalize_dm_name_removes_spacing_and_emoji(self) -> None:
        self.assertEqual(_normalize_dm_name(" 王子 🤴 践行者 "), "王子践行者")

    def test_dm_names_match_accepts_normalized_variants(self) -> None:
        self.assertTrue(_dm_names_match("王子 🤴 践行者", "王子践行者"))
        self.assertTrue(_dm_names_match("王子践行者", "王子🤴践行者"))

    def test_dm_send_not_confirmed_by_history_only(self) -> None:
        previous_chat = "越姐来了\n您好 · 04-11"
        state = {
            "composer_text": "",
            "chat_body_text": "越姐来了\n您好 · 04-11",
        }
        self.assertFalse(
            _dm_send_confirmed(
                state,
                "您好",
                previous_chat_body_text=previous_chat,
            )
        )

    def test_dm_send_confirmed_when_message_count_increases(self) -> None:
        previous_chat = "越姐来了\n您好 · 04-11"
        state = {
            "composer_text": "",
            "chat_body_text": "越姐来了\n您好 · 04-11\n您好 · 16:59",
        }
        self.assertTrue(
            _dm_send_confirmed(
                state,
                "您好",
                previous_chat_body_text=previous_chat,
            )
        )

    @patch.object(douyin_collector.time, "sleep", return_value=None)
    @patch.object(douyin_collector, "_ensure_dm_not_captcha")
    @patch.object(douyin_collector, "_navigate_dm_page")
    @patch.object(douyin_collector, "_read_dm_state_with_retry")
    @patch.object(douyin_collector, "_build_select_chat_script")
    @patch.object(douyin_collector, "_run_agent_browser")
    def test_open_profile_dm_fills_message_when_dm_input_is_ready(
        self,
        run_browser_mock,
        build_select_chat_script_mock,
        read_dm_state_mock,
        navigate_mock,
        captcha_mock,
        sleep_mock,
    ) -> None:
        snapshot = 'button "私信" [ref=e10]\ntextbox "搜索" [ref=e1]'
        run_browser_mock.side_effect = [
            snapshot,
            '{"clicked": true}',
            snapshot,
            "https://www.douyin.com/messages",
            "",
            "",
            "",
            "您好",
        ]
        read_dm_state_mock.return_value = {
            "has_input_box": True,
            "has_settings_prompt": False,
            "has_send_text": True,
            "composer_text": "",
            "current_chat_name": "",
            "chat_body_text": "",
        }

        result = open_profile_dm(
            "https://www.douyin.com/user/mock_user",
            auto_connect=False,
            target_name="王子🤴践行者",
            message_text="您好",
            send_message=False,
        )

        self.assertTrue(result["opened"])
        self.assertTrue(result["filled"])
        self.assertFalse(result["sent"])
        self.assertIn("填入“您好”", result["detail"])
        navigate_mock.assert_called_once()
        captcha_mock.assert_called_once()
        build_select_chat_script_mock.assert_not_called()
        sleep_mock.assert_called()

    @patch.object(douyin_collector.time, "sleep", return_value=None)
    @patch.object(douyin_collector, "_ensure_dm_not_captcha")
    @patch.object(douyin_collector, "_navigate_dm_page")
    @patch.object(douyin_collector, "_read_dm_state_with_retry")
    @patch.object(douyin_collector, "_build_select_chat_script")
    @patch.object(douyin_collector, "_run_agent_browser")
    def test_open_profile_dm_skips_reselect_when_chat_name_matches_after_normalization(
        self,
        run_browser_mock,
        build_select_chat_script_mock,
        read_dm_state_mock,
        navigate_mock,
        captcha_mock,
        sleep_mock,
    ) -> None:
        snapshot = 'button "私信" [ref=e10]\ntextbox "搜索" [ref=e1]'
        run_browser_mock.side_effect = [
            snapshot,
            '{"clicked": true}',
            snapshot,
            "https://www.douyin.com/messages",
            "",
            "",
            "",
            "您好",
        ]
        read_dm_state_mock.return_value = {
            "has_input_box": True,
            "has_settings_prompt": False,
            "has_send_text": True,
            "composer_text": "",
            "current_chat_name": "王子 🤴 践行者",
            "chat_body_text": "",
        }

        result = open_profile_dm(
            "https://www.douyin.com/user/mock_user",
            auto_connect=False,
            target_name="王子践行者",
            message_text="您好",
            send_message=False,
        )

        self.assertTrue(result["opened"])
        self.assertTrue(result["filled"])
        self.assertFalse(result["sent"])
        build_select_chat_script_mock.assert_not_called()
        navigate_mock.assert_called_once()
        captcha_mock.assert_called_once()
        sleep_mock.assert_called()


if __name__ == "__main__":
    unittest.main()
