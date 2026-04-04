#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import re
import sys
from urllib.request import Request, urlopen


def fetch_url(url: str) -> str:
    req = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36"
        },
    )
    with urlopen(req, timeout=20) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def extract_hot_terms(html: str):
    patterns = [
        r'"word"\s*:\s*"([^"]+)"',
        r'"sentence_id".*?"word"\s*:\s*"([^"]+)"',
        r'>\s*([^<>]{2,30}?)\s*</a>',
    ]
    seen = []
    for pattern in patterns:
        for match in re.findall(pattern, html, re.DOTALL):
            text = re.sub(r'\\u[0-9a-fA-F]{4}', '', match).strip()
            text = re.sub(r'\s+', ' ', text)
            if 2 <= len(text) <= 30 and text not in seen:
                seen.append(text)
    return seen


def main():
    # 第一版先尝试公开热榜页；后续可替换为更稳定的数据源
    candidates = [
        "https://www.douyin.com/hot",
        "https://www.douyin.com/hot/board",
    ]

    last_error = None
    for url in candidates:
        try:
            html = fetch_url(url)
            words = extract_hot_terms(html)
            if words:
                result = {
                    "source": url,
                    "top1": words[0],
                    "top10": words[:10],
                }
                print(json.dumps(result, ensure_ascii=False, indent=2))
                return
        except Exception as e:
            last_error = str(e)

    print(json.dumps({
        "error": "failed_to_fetch_douyin_hot",
        "detail": last_error,
        "fallback_needed": True
    }, ensure_ascii=False, indent=2))
    sys.exit(1)


if __name__ == "__main__":
    main()
