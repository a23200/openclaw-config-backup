#!/usr/bin/env python3
"""
闲鱼市场调研脚本

示例:
  python market_research.py "iPhone 17" --cookie-id 3083424450 --max-pages 3
  python market_research.py "iPhone 17" --exclude 手机壳 --exclude 贴膜 --csv-out reports/iphone17.csv
  python market_research.py "iPhone 17" --watch --interval 300 --rounds 6
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import math
import re
import statistics
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Sequence


CONDITION_PATTERNS: list[tuple[str, Sequence[str]]] = [
    ("全新未拆", ("全新未拆", "未拆封", "原封", "全新原封")),
    ("全新", ("全新", "未使用", "仅拆封", "激活未使用")),
    ("99新", ("99新", "九九新", "9.9成新", "9.9新")),
    ("98新", ("98新", "9.8成新", "9.8新")),
    ("95新", ("95新", "9.5成新", "9.5新")),
    ("9成新", ("9成新", "9新", "90新")),
    ("85新", ("85新", "8.5成新", "8.5新")),
    ("8成新", ("8成新", "8新", "80新")),
]

DEFECT_KEYWORDS: Sequence[str] = (
    "轻微划痕",
    "划痕",
    "磕碰",
    "掉漆",
    "磨损",
    "维修",
    "拆修",
    "换屏",
    "进水",
    "面容坏",
    "id锁",
    "锁机",
)

COLOR_KEYWORDS: Sequence[str] = (
    "黑色",
    "白色",
    "蓝色",
    "绿色",
    "紫色",
    "粉色",
    "红色",
    "黄色",
    "金色",
    "银色",
    "深空黑",
    "星光色",
    "原色",
    "午夜色",
    "远峰蓝",
    "沙漠色",
    "钛金属",
)

CSV_FIELDNAMES: Sequence[str] = (
    "title",
    "price_text",
    "price_value",
    "condition",
    "defects",
    "storage",
    "battery_health",
    "color",
    "want_count",
    "area",
    "seller_name",
    "publish_time",
    "item_url",
    "tags_text",
    "item_id",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="实时抓取闲鱼搜索结果并生成市场调研摘要")
    parser.add_argument("keyword", nargs="?", help="搜索关键词，例如：iPhone 17")
    parser.add_argument("--cookie-id", help="使用指定账号的 Cookie ID；不传则自动选择第一个有效账号")
    parser.add_argument("--max-pages", type=int, default=3, help="抓取页数，默认 3")
    parser.add_argument("--top", type=int, default=15, help="控制台展示前 N 条结果，默认 15")
    parser.add_argument(
        "--sort",
        choices=("price_asc", "price_desc", "want_desc", "latest"),
        default="price_asc",
        help="控制台排序方式，默认按价格升序",
    )
    parser.add_argument("--include", action="append", default=[], help="标题必须包含的词，可重复传入")
    parser.add_argument("--exclude", action="append", default=[], help="标题排除词，可重复传入")
    parser.add_argument("--min-price", type=float, help="最低价格过滤")
    parser.add_argument("--max-price", type=float, help="最高价格过滤")
    parser.add_argument("--watch", action="store_true", help="轮询模式，持续刷新最新结果")
    parser.add_argument("--interval", type=int, default=300, help="轮询间隔秒数，默认 300")
    parser.add_argument("--rounds", type=int, default=0, help="轮询次数；0 表示无限轮询")
    parser.add_argument("--json-out", help="将最新结果导出到 JSON 文件")
    parser.add_argument("--csv-out", help="将最新结果导出到 CSV 文件")
    parser.add_argument("--show-links", action="store_true", help="控制台展示商品链接")
    parser.add_argument("--list-cookies", action="store_true", help="列出当前数据库里的 Cookie 账号")
    return parser.parse_args()


def parse_price(value: Any) -> float | None:
    text = str(value or "").strip()
    if not text:
        return None

    text = text.replace("当前价", "").replace("¥", "").replace("￥", "").replace("元", "").replace(",", "").strip()
    if not text or text in {"价格异常", "面议"}:
        return None

    multiplier = 1.0
    if text.endswith("万"):
        multiplier = 10000.0
        text = text[:-1].strip()

    match = re.search(r"\d+(?:\.\d+)?", text)
    if not match:
        return None

    try:
        return float(match.group()) * multiplier
    except ValueError:
        return None


def normalize_price_text(price_value: float | None, fallback_text: str) -> str:
    if price_value is None:
        return fallback_text or "未知"
    return f"¥{price_value:,.0f}"


def extract_condition(text: str) -> str:
    normalized = text.lower()
    for label, keywords in CONDITION_PATTERNS:
        if any(keyword.lower() in normalized for keyword in keywords):
            return label
    return "未识别"


def extract_defects(text: str) -> list[str]:
    normalized = text.lower()
    return [keyword for keyword in DEFECT_KEYWORDS if keyword.lower() in normalized]


def extract_storage(text: str) -> str:
    patterns = (
        r"(?<!\d)(64|128|256|512)\s*(?:g|gb)(?![a-z])",
        r"(?<!\d)(1)\s*(?:t|tb)(?![a-z])",
    )
    lower_text = text.lower()
    for pattern in patterns:
        match = re.search(pattern, lower_text, flags=re.IGNORECASE)
        if not match:
            continue
        number = match.group(1)
        if number == "1":
            return "1TB"
        return f"{number}GB"
    return "未知"


def extract_battery_health(text: str) -> int | None:
    patterns = (
        r"(?:电池健康|电池|健康度|效率)\D{0,6}(\d{2,3})\s*%",
        r"(\d{2,3})\s*%\s*(?:电池健康|电池|健康度|效率)",
    )
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            value = int(match.group(1))
            if 50 <= value <= 100:
                return value
    return None


def extract_color(text: str) -> str:
    for keyword in COLOR_KEYWORDS:
        if keyword in text:
            return keyword
    return "未知"


def percentile(values: Sequence[float], ratio: float) -> float | None:
    if not values:
        return None
    if len(values) == 1:
        return float(values[0])

    sorted_values = sorted(values)
    index = (len(sorted_values) - 1) * ratio
    lower = math.floor(index)
    upper = math.ceil(index)
    if lower == upper:
        return float(sorted_values[lower])

    lower_value = sorted_values[lower]
    upper_value = sorted_values[upper]
    return float(lower_value + (upper_value - lower_value) * (index - lower))


def stringify_tags(tags: Any) -> str:
    if isinstance(tags, (list, tuple)):
        return " | ".join(str(tag) for tag in tags if str(tag).strip())
    return str(tags or "")


def build_search_text(item: dict[str, Any]) -> str:
    parts = [
        str(item.get("title") or ""),
        stringify_tags(item.get("tags")),
        str(item.get("area") or ""),
    ]
    return " ".join(part for part in parts if part).strip()


def normalize_item(item: dict[str, Any]) -> dict[str, Any]:
    text = build_search_text(item)
    price_value = parse_price(item.get("price"))
    defects = extract_defects(text)
    return {
        "item_id": str(item.get("item_id") or ""),
        "title": str(item.get("title") or "").strip(),
        "price_text": str(item.get("price") or "").strip(),
        "price_value": price_value,
        "price_display": normalize_price_text(price_value, str(item.get("price") or "").strip()),
        "condition": extract_condition(text),
        "defects": defects,
        "defects_text": "、".join(defects) if defects else "",
        "storage": extract_storage(text),
        "battery_health": extract_battery_health(text),
        "color": extract_color(text),
        "want_count": int(item.get("want_count") or 0),
        "area": str(item.get("area") or "地区未知"),
        "seller_name": str(item.get("seller_name") or "匿名卖家"),
        "publish_time": str(item.get("publish_time") or ""),
        "item_url": str(item.get("item_url") or "").strip(),
        "tags_text": stringify_tags(item.get("tags")),
        "search_text": text,
        "unique_key": str(item.get("item_url") or item.get("item_id") or item.get("title") or "").strip(),
        "raw_item": item,
    }


def dedupe_items(items: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        key = item.get("unique_key") or item.get("title") or ""
        if not key or key in seen:
            continue
        seen.add(key)
        results.append(item)
    return results


def filter_items(
    items: Iterable[dict[str, Any]],
    include_terms: Sequence[str] | None = None,
    exclude_terms: Sequence[str] | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
) -> list[dict[str, Any]]:
    include_terms = [term.strip().lower() for term in (include_terms or []) if term.strip()]
    exclude_terms = [term.strip().lower() for term in (exclude_terms or []) if term.strip()]

    filtered: list[dict[str, Any]] = []
    for item in items:
        haystack = f"{item.get('title', '')} {item.get('tags_text', '')}".lower()
        if include_terms and not all(term in haystack for term in include_terms):
            continue
        if exclude_terms and any(term in haystack for term in exclude_terms):
            continue

        price_value = item.get("price_value")
        if min_price is not None and price_value is not None and price_value < min_price:
            continue
        if max_price is not None and price_value is not None and price_value > max_price:
            continue

        filtered.append(item)

    return filtered


def sort_items(items: Iterable[dict[str, Any]], sort_by: str) -> list[dict[str, Any]]:
    items = list(items)
    if sort_by == "price_desc":
        return sorted(items, key=lambda item: (item.get("price_value") is None, -(item.get("price_value") or 0), -item.get("want_count", 0)))
    if sort_by == "want_desc":
        return sorted(items, key=lambda item: (-item.get("want_count", 0), item.get("price_value") or float("inf")))
    if sort_by == "latest":
        return sorted(items, key=lambda item: item.get("publish_time") or "", reverse=True)
    return sorted(items, key=lambda item: (item.get("price_value") is None, item.get("price_value") or float("inf"), -item.get("want_count", 0)))


def summarize_items(items: Sequence[dict[str, Any]]) -> dict[str, Any]:
    prices = [float(item["price_value"]) for item in items if item.get("price_value") is not None]
    condition_counter = Counter(item.get("condition") or "未识别" for item in items)
    area_counter = Counter(item.get("area") or "地区未知" for item in items)

    storage_prices: dict[str, list[float]] = defaultdict(list)
    for item in items:
        if item.get("storage") and item.get("storage") != "未知" and item.get("price_value") is not None:
            storage_prices[str(item["storage"])].append(float(item["price_value"]))

    storage_breakdown = []
    for storage, storage_values in sorted(storage_prices.items(), key=lambda pair: (len(pair[1]), pair[0]), reverse=True):
        storage_breakdown.append(
            {
                "storage": storage,
                "count": len(storage_values),
                "median_price": statistics.median(storage_values),
                "avg_price": statistics.mean(storage_values),
            }
        )

    return {
        "count": len(items),
        "priced_count": len(prices),
        "min_price": min(prices) if prices else None,
        "p25_price": percentile(prices, 0.25) if prices else None,
        "median_price": statistics.median(prices) if prices else None,
        "avg_price": statistics.mean(prices) if prices else None,
        "p75_price": percentile(prices, 0.75) if prices else None,
        "max_price": max(prices) if prices else None,
        "condition_breakdown": condition_counter.most_common(),
        "area_breakdown": area_counter.most_common(5),
        "storage_breakdown": storage_breakdown[:8],
    }


def serialize_market_item(item: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in item.items()
        if key not in {"raw_item", "search_text", "unique_key"}
    }


def build_market_analysis(
    raw_items: Sequence[dict[str, Any]],
    include_terms: Sequence[str] | None = None,
    exclude_terms: Sequence[str] | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    sort_by: str = "price_asc",
) -> dict[str, Any]:
    normalized_items = [normalize_item(item) for item in raw_items]
    deduped_items = dedupe_items(normalized_items)
    filtered_items = filter_items(
        deduped_items,
        include_terms=include_terms,
        exclude_terms=exclude_terms,
        min_price=min_price,
        max_price=max_price,
    )
    sorted_items = sort_items(filtered_items, sort_by)
    summary = summarize_items(sorted_items)
    return {
        "items": sorted_items,
        "summary": summary,
        "raw_count": len(raw_items),
        "deduped_count": len(deduped_items),
        "filtered_count": len(sorted_items),
    }


def ensure_parent(path: str | None) -> Path | None:
    if not path:
        return None
    file_path = Path(path)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    return file_path


def export_json(path: str, payload: dict[str, Any]) -> None:
    file_path = ensure_parent(path)
    if not file_path:
        return
    file_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def export_csv(path: str, items: Sequence[dict[str, Any]]) -> None:
    file_path = ensure_parent(path)
    if not file_path:
        return
    with file_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(CSV_FIELDNAMES))
        writer.writeheader()
        for item in items:
            writer.writerow(
                {
                    "title": item.get("title", ""),
                    "price_text": item.get("price_text", ""),
                    "price_value": item.get("price_value", ""),
                    "condition": item.get("condition", ""),
                    "defects": item.get("defects_text", ""),
                    "storage": item.get("storage", ""),
                    "battery_health": item.get("battery_health", ""),
                    "color": item.get("color", ""),
                    "want_count": item.get("want_count", 0),
                    "area": item.get("area", ""),
                    "seller_name": item.get("seller_name", ""),
                    "publish_time": item.get("publish_time", ""),
                    "item_url": item.get("item_url", ""),
                    "tags_text": item.get("tags_text", ""),
                    "item_id": item.get("item_id", ""),
                }
            )


def shorten(text: str, width: int) -> str:
    if len(text) <= width:
        return text
    return text[: max(0, width - 1)] + "…"


def format_battery(value: int | None) -> str:
    return f"{value}%" if value is not None else "-"


def print_summary_block(summary: dict[str, Any]) -> None:
    print(
        "价格摘要: "
        f"样本 {summary['count']} 条 | "
        f"有效价格 {summary['priced_count']} 条 | "
        f"最低 {normalize_price_text(summary['min_price'], '-')} | "
        f"P25 {normalize_price_text(summary['p25_price'], '-')} | "
        f"中位 {normalize_price_text(summary['median_price'], '-')} | "
        f"均价 {normalize_price_text(summary['avg_price'], '-')} | "
        f"P75 {normalize_price_text(summary['p75_price'], '-')} | "
        f"最高 {normalize_price_text(summary['max_price'], '-')}"
    )

    condition_text = " / ".join(f"{label}:{count}" for label, count in summary["condition_breakdown"][:8]) or "无"
    storage_text = " / ".join(
        f"{entry['storage']}:{entry['count']}条@{normalize_price_text(entry['median_price'], '-')}"
        for entry in summary["storage_breakdown"][:6]
    ) or "无"
    area_text = " / ".join(f"{area}:{count}" for area, count in summary["area_breakdown"][:5]) or "无"

    print(f"成色分布: {condition_text}")
    print(f"容量分组: {storage_text}")
    print(f"地区分布: {area_text}")


def print_items_block(items: Sequence[dict[str, Any]], top: int, show_links: bool) -> None:
    if not items:
        print("无匹配商品。")
        return

    print("Top 结果:")
    print(f"{'#':<3} {'价格':>10} {'成色':<8} {'容量':<8} {'电池':<6} {'想要':>5} {'地区':<10} 标题")
    for index, item in enumerate(items[:top], start=1):
        print(
            f"{index:<3} "
            f"{item['price_display']:>10} "
            f"{shorten(item['condition'], 8):<8} "
            f"{shorten(item['storage'], 8):<8} "
            f"{format_battery(item['battery_health']):<6} "
            f"{item['want_count']:>5} "
            f"{shorten(item['area'], 10):<10} "
            f"{shorten(item['title'], 52)}"
        )
        if item.get("defects_text"):
            print(f"    瑕疵: {item['defects_text']}")
        if show_links and item.get("item_url"):
            print(f"    链接: {item['item_url']}")


def print_report(
    keyword: str,
    cookie_id: str,
    round_index: int,
    items: Sequence[dict[str, Any]],
    summary: dict[str, Any],
    top: int,
    show_links: bool,
    new_items: Sequence[dict[str, Any]] | None = None,
) -> None:
    now_text = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print("\n" + "=" * 96)
    print(f"[{now_text}] 关键词: {keyword} | 账号: {cookie_id} | 第 {round_index} 轮")
    print_summary_block(summary)
    if new_items is not None:
        print(f"本轮新增: {len(new_items)} 条")
        if new_items:
            print_items_block(new_items, min(top, len(new_items)), show_links)
            print("-" * 96)
    print_items_block(items, top, show_links)


def resolve_cookie_id(requested_cookie_id: str | None) -> str:
    from db_manager import db_manager

    if requested_cookie_id:
        cookie_info = db_manager.get_cookie_by_id(str(requested_cookie_id))
        cookie_value = str((cookie_info or {}).get("cookies_str") or "").strip()
        if not cookie_info or len(cookie_value) < 50:
            raise ValueError(f"未找到可用 Cookie: {requested_cookie_id}")
        return str(requested_cookie_id)

    cookies = db_manager.get_all_cookies()
    for cookie_id, cookie_value in cookies.items():
        if len(str(cookie_value or "").strip()) >= 50:
            return str(cookie_id)
    raise ValueError("数据库中没有可用 Cookie，请先在管理后台添加账号")


def list_cookies() -> int:
    from db_manager import db_manager

    cookies = db_manager.get_all_cookies()
    if not cookies:
        print("当前没有可用 Cookie。")
        return 0

    print("可用 Cookie 账号:")
    for cookie_id, cookie_value in cookies.items():
        details = db_manager.get_cookie_details(cookie_id) or {}
        username = details.get("username") or "-"
        remark = details.get("remark") or "-"
        validity = "valid" if len(str(cookie_value or "").strip()) >= 50 else "short"
        print(f"- {cookie_id} | username={username} | remark={remark} | {validity}")
    return 0


async def fetch_search_result(keyword: str, cookie_id: str, max_pages: int) -> dict[str, Any]:
    from utils.item_search import (
        search_multiple_pages_xianyu_with_cookie,
        search_xianyu_items_with_cookie,
    )

    if max_pages > 1:
        return await search_multiple_pages_xianyu_with_cookie(
            cookie_id=cookie_id,
            keyword=keyword,
            total_pages=max_pages,
        )

    return await search_xianyu_items_with_cookie(
        cookie_id=cookie_id,
        keyword=keyword,
        page=1,
        page_size=20,
    )


def build_export_payload(keyword: str, cookie_id: str, result: dict[str, Any], items: Sequence[dict[str, Any]], summary: dict[str, Any]) -> dict[str, Any]:
    return {
        "keyword": keyword,
        "cookie_id": cookie_id,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "source": result.get("source"),
        "is_real_data": result.get("is_real_data", False),
        "total_returned": len(items),
        "summary": summary,
        "items": [serialize_market_item(item) for item in items],
    }


async def run_once(args: argparse.Namespace, cookie_id: str) -> int:
    seen_keys: set[str] = set()
    round_index = 0

    while True:
        round_index += 1
        result = await fetch_search_result(args.keyword, cookie_id, args.max_pages)

        if result.get("captcha_required"):
            captcha_info = result.get("captcha_info", {})
            print("搜索触发验证码，请先手动处理：", file=sys.stderr)
            if captcha_info.get("control_url"):
                print(f"- 控制页面: {captcha_info['control_url']}", file=sys.stderr)
            if captcha_info.get("base_control_url"):
                print(f"- 入口页面: {captcha_info['base_control_url']}", file=sys.stderr)
            return 2

        if result.get("error"):
            print(f"搜索失败: {result['error']}", file=sys.stderr)
            return 1

        analysis = build_market_analysis(
            result.get("items", []),
            include_terms=args.include,
            exclude_terms=args.exclude,
            min_price=args.min_price,
            max_price=args.max_price,
            sort_by=args.sort,
        )
        sorted_items = analysis["items"]
        summary = analysis["summary"]

        new_items = [item for item in sorted_items if item["unique_key"] not in seen_keys]
        seen_keys.update(item["unique_key"] for item in sorted_items)

        print_report(
            keyword=args.keyword,
            cookie_id=cookie_id,
            round_index=round_index,
            items=sorted_items,
            summary=summary,
            top=args.top,
            show_links=args.show_links,
            new_items=new_items if args.watch else None,
        )

        payload = build_export_payload(args.keyword, cookie_id, result, sorted_items, summary)
        if args.json_out:
            export_json(args.json_out, payload)
            print(f"JSON 已导出: {args.json_out}")
        if args.csv_out:
            export_csv(args.csv_out, sorted_items)
            print(f"CSV 已导出: {args.csv_out}")

        if not args.watch:
            return 0
        if args.rounds > 0 and round_index >= args.rounds:
            return 0

        print(f"等待 {args.interval} 秒后开始下一轮...\n")
        await asyncio.sleep(args.interval)


def main() -> int:
    args = parse_args()

    if args.list_cookies:
        return list_cookies()

    if not args.keyword:
        print("请提供搜索关键词，例如: python market_research.py \"iPhone 17\"", file=sys.stderr)
        return 1

    try:
        cookie_id = resolve_cookie_id(args.cookie_id)
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1

    try:
        return asyncio.run(run_once(args, cookie_id))
    except KeyboardInterrupt:
        print("\n已停止轮询。")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
