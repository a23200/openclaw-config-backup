"""V1 体量档推导与黑盒文案"""
from application.core.v1_length_tiers import (
    build_v1_structure_black_box_hint,
    resolve_v1_length_params,
    V1_LENGTH_TIERS,
)


def test_resolve_standard_tier_default_words():
    chapters, wpc, tier = resolve_v1_length_params("standard", 100, None)
    assert tier == "standard"
    assert wpc == 2000
    assert chapters == 500  # 1_000_000 / 2000


def test_resolve_short_tier_custom_words():
    chapters, wpc, tier = resolve_v1_length_params("short", 100, 2400)
    assert tier == "short"
    assert wpc == 2400
    assert chapters == 125  # ceil(300_000 / 2400)


def test_resolve_without_tier_uses_chapters():
    chapters, wpc, tier = resolve_v1_length_params(None, 80, 3000)
    assert tier is None
    assert chapters == 80
    assert wpc == 3000


def test_black_box_contains_volume_hint():
    text = build_v1_structure_black_box_hint("standard", 500, 2000)
    assert "规划目标体量" in text
    assert "勿向读者展示" in text


def test_tier_meta_present():
    assert "approx_total_words" in V1_LENGTH_TIERS["epic"]


def test_article_tier_resolves_to_about_10k_words():
    """article 档(约 1 万字):target_chapters 由 ceil(10000/2500)=4 默认推导。"""
    chapters, wpc, tier = resolve_v1_length_params("article", 0, None)
    assert tier == "article"
    assert wpc == 2500
    assert chapters == 4
    assert chapters * wpc == 10_000


def test_article_tier_honors_custom_chapter_words():
    """用户可以覆盖 default_chapter_words;仍按总字数/章长推导章数。"""
    chapters, wpc, tier = resolve_v1_length_params("article", 0, 10_000)
    assert tier == "article"
    assert wpc == 10_000
    assert chapters == 1


def test_article_meta_marked_adaptive():
    """article 档被标记为 adaptive,表示章数由 ArticleTopicAnalyzer 动态决定。"""
    meta = V1_LENGTH_TIERS["article"]
    assert meta.get("adaptive") is True
    assert meta["approx_total_words"] == 10_000
