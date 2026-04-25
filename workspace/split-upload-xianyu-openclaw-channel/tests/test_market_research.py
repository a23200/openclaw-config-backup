from market_research import (
    dedupe_items,
    extract_battery_health,
    extract_condition,
    extract_storage,
    filter_items,
    normalize_item,
    parse_price,
    summarize_items,
)


def test_parse_price_variants():
    assert parse_price("¥6999") == 6999.0
    assert parse_price("6999元") == 6999.0
    assert parse_price("1.2万") == 12000.0
    assert parse_price("面议") is None


def test_extract_market_features():
    text = "iPhone 17 Pro Max 256GB 95新 电池健康 91% 深空黑 轻微划痕"
    assert extract_condition(text) == "95新"
    assert extract_storage(text) == "256GB"
    assert extract_battery_health(text) == 91


def test_filter_dedupe_and_summary():
    raw_items = [
        {
            "item_id": "1",
            "title": "iPhone 17 128GB 95新",
            "price": "¥5999",
            "item_url": "https://example.com/1",
            "want_count": 5,
            "tags": ["95新", "5人想要"],
            "area": "上海",
        },
        {
            "item_id": "1-dup",
            "title": "iPhone 17 128GB 95新",
            "price": "¥5999",
            "item_url": "https://example.com/1",
            "want_count": 3,
            "tags": ["95新"],
            "area": "上海",
        },
        {
            "item_id": "2",
            "title": "iPhone 17 Pro 256GB 99新 电池健康 98%",
            "price": "¥7299",
            "item_url": "https://example.com/2",
            "want_count": 8,
            "tags": ["99新"],
            "area": "杭州",
        },
        {
            "item_id": "3",
            "title": "iPhone 17 手机壳",
            "price": "¥39",
            "item_url": "https://example.com/3",
            "want_count": 1,
            "tags": [],
            "area": "深圳",
        },
    ]

    items = dedupe_items([normalize_item(item) for item in raw_items])
    assert len(items) == 3

    filtered = filter_items(items, include_terms=["iphone", "17"], exclude_terms=["手机壳"])
    assert len(filtered) == 2

    summary = summarize_items(filtered)
    assert summary["count"] == 2
    assert summary["min_price"] == 5999.0
    assert summary["max_price"] == 7299.0
