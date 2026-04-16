import unittest

from app.services.lead_scoring import matches_min_level, normalize_min_level, score_comment


class ScoreCommentTests(unittest.TestCase):
    def test_high_intent_comment(self) -> None:
        result = score_comment("这个怎么联系？多少钱？")
        self.assertEqual(result.level, "high")
        self.assertGreaterEqual(result.score, 70)

    def test_medium_intent_comment(self) -> None:
        result = score_comment("效果怎么样？适合新手吗？")
        self.assertEqual(result.level, "medium")

    def test_negative_comment(self) -> None:
        result = score_comment("广告吧，路过")
        self.assertEqual(result.level, "low")
        self.assertLess(result.score, 40)

    def test_custom_keywords_raise_relevance_score(self) -> None:
        result = score_comment("这个项目适合新手吗，我想做", custom_keywords=["新手", "想做"])
        self.assertGreaterEqual(result.score, 40)
        self.assertIn(result.level, {"medium", "high"})

    def test_min_level_matching(self) -> None:
        self.assertTrue(matches_min_level("high", "medium"))
        self.assertTrue(matches_min_level("medium", "medium"))
        self.assertFalse(matches_min_level("low", "medium"))
        self.assertEqual(normalize_min_level("all"), "low")


if __name__ == "__main__":
    unittest.main()
