import unittest

from app.services.douyin_collector import (
    build_comment_identifier,
    extract_video_identifier,
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


if __name__ == "__main__":
    unittest.main()
