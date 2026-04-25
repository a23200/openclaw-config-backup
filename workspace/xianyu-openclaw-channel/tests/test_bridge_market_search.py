import pytest
from fastapi import HTTPException

import bridge_api
from utils import item_search


class DummyWebSocket:
    def __init__(self, closed: bool = False):
        self.closed = closed


class DummyInstance:
    def __init__(self, ws):
        self.ws = ws


def test_market_contact_message_uses_scene_specific_prompt():
    item = bridge_api.MarketSellerContactItem(
        item_id="item-1",
        title="奥克斯按摩椅 几乎全新",
        seller_name="张三",
        seller_user_id="seller-1",
    )

    message = bridge_api._render_market_contact_message("", item)

    assert "电池" not in message
    assert "功能" in message or "使用情况" in message


def test_market_contact_busy_retry_delay_is_longer():
    delay = bridge_api._get_market_contact_retry_delay("闲鱼走神了，您稍后再试～", 2)
    assert delay >= 20


def test_get_instance_rejects_closed_websocket():
    original_instances = dict(bridge_api.xianyu_instances)
    try:
        bridge_api.xianyu_instances.clear()
        bridge_api.xianyu_instances["acct"] = DummyInstance(DummyWebSocket(closed=True))

        with pytest.raises(HTTPException) as exc_info:
            bridge_api._get_instance("acct")

        assert exc_info.value.status_code == 503
        assert "WebSocket disconnected" in str(exc_info.value.detail)
    finally:
        bridge_api.xianyu_instances.clear()
        bridge_api.xianyu_instances.update(original_instances)


@pytest.mark.asyncio
async def test_search_with_cookie_forwards_price_filters(monkeypatch):
    captured = {}

    class FakeSearcher:
        def __init__(self):
            self.preferred_cookie_id = None
            self.user_id = None
            self.captcha_mode = None
            self.allow_local_browser_handoff = False
            self.last_captcha_info = {}

        async def search_items(self, keyword, page, page_size, min_price=None, max_price=None):
            captured["keyword"] = keyword
            captured["page"] = page
            captured["page_size"] = page_size
            captured["min_price"] = min_price
            captured["max_price"] = max_price
            return {"items": [], "total": 0, "source": "fake"}

        async def close_browser(self):
            return None

    monkeypatch.setattr(item_search, "XianyuSearcher", FakeSearcher)

    result = await item_search.search_xianyu_items_with_cookie(
        cookie_id="cookie-1",
        keyword="iphone",
        page=2,
        page_size=40,
        min_price=123,
        max_price=456,
    )

    assert result["source"] == "fake"
    assert captured == {
        "keyword": "iphone",
        "page": 2,
        "page_size": 40,
        "min_price": 123,
        "max_price": 456,
    }


@pytest.mark.asyncio
async def test_search_with_cookie_preserves_actual_error(monkeypatch):
    class FakeSearcher:
        def __init__(self):
            self.preferred_cookie_id = None
            self.user_id = None
            self.captcha_mode = None
            self.allow_local_browser_handoff = False
            self.last_captcha_info = {}

        async def search_items(self, keyword, page, page_size, min_price=None, max_price=None):
            return {"items": [], "total": 0, "error": "滑块验证失败"}

        async def close_browser(self):
            return None

    monkeypatch.setattr(item_search, "XianyuSearcher", FakeSearcher)

    result = await item_search.search_xianyu_items_with_cookie(
        cookie_id="cookie-1",
        keyword="iphone",
    )

    assert result["error"] == "滑块验证失败"


@pytest.mark.asyncio
async def test_multi_page_search_with_cookie_mode_preserves_actual_error(monkeypatch):
    class FakeSearcher:
        def __init__(self):
            self.preferred_cookie_id = None
            self.user_id = None
            self.captcha_mode = None
            self.allow_local_browser_handoff = False
            self.last_captcha_info = {}

        async def search_multiple_pages(self, keyword, total_pages, min_price=None, max_price=None):
            return {"items": [], "total": 0, "error": "未找到搜索框元素"}

        async def close_browser(self):
            return None

    monkeypatch.setattr(item_search, "XianyuSearcher", FakeSearcher)

    result = await item_search.search_multiple_pages_xianyu_with_cookie_mode(
        cookie_id="cookie-1",
        keyword="mac mini",
        total_pages=3,
    )

    assert result["error"] == "未找到搜索框元素"
