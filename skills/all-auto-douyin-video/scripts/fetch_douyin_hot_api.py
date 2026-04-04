#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
import sys
from urllib.request import Request, urlopen

# 可替换热榜源列表；后续只要改这里，不动主流程
CANDIDATE_SOURCES = [
    {
        "name": "xxapi_douyin",
        "url": "https://v2.xxapi.cn/api/douyinhot",
        "extractor": "xxapi",
    },
    {
        "name": "tenapi_douyin",
        "url": "https://tenapi.cn/v2/douyinhot",
        "extractor": "tenapi",
    },
    {
        "name": "vvhan_douyin",
        "url": "https://api.vvhan.com/api/hotlist/douyinHot",
        "extractor": "vvhan",
    },
]


def fetch_json(url: str):
    req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(req, timeout=20) as resp:
        raw = resp.read().decode("utf-8", errors="ignore")
    return json.loads(raw)


def extract_top1(name: str, data):
    # xxapi 结构兼容
    if name == "xxapi":
        if isinstance(data, dict) and isinstance(data.get("data"), list) and data["data"]:
            item = data["data"][0]
            for tkey in ("word", "title", "name", "hotword", "keyword"):
                if isinstance(item, dict) and item.get(tkey):
                    return item[tkey], item
        raise ValueError("xxapi format not recognized")

    # tenapi 常见结构兼容
    if name == "tenapi":
        for key in ("data", "list", "newslist", "result"):
            if isinstance(data, dict) and isinstance(data.get(key), list) and data[key]:
                item = data[key][0]
                for tkey in ("title", "name", "hotword", "word", "keyword"):
                    if isinstance(item, dict) and item.get(tkey):
                        return item[tkey], item
        raise ValueError("tenapi format not recognized")

    # vvhan 常见结构兼容
    if name == "vvhan":
        if isinstance(data, dict):
            for key in ("data", "list"):
                if isinstance(data.get(key), list) and data[key]:
                    item = data[key][0]
                    for tkey in ("title", "name", "hotword", "word", "keyword"):
                        if isinstance(item, dict) and item.get(tkey):
                            return item[tkey], item
        raise ValueError("vvhan format not recognized")

    raise ValueError(f"unknown extractor: {name}")


def main():
    debug = os.getenv("DEBUG_DOUYIN_HOT", "0") == "1"
    errors = []

    for source in CANDIDATE_SOURCES:
        try:
            data = fetch_json(source["url"])
            top1, raw_item = extract_top1(source["extractor"], data)
            print(json.dumps({
                "ok": True,
                "source": source["name"],
                "top1": top1,
                "raw": raw_item,
            }, ensure_ascii=False, indent=2))
            return
        except Exception as e:
            errors.append({"source": source["name"], "error": str(e)})
            if debug:
                print(f"DEBUG source failed: {source['name']} -> {e}", file=sys.stderr)

    print(json.dumps({
        "ok": False,
        "error": "no_available_hot_source",
        "candidates": [s["name"] for s in CANDIDATE_SOURCES],
        "errors": errors,
        "next": "replace_or_add_source"
    }, ensure_ascii=False, indent=2))
    sys.exit(1)


if __name__ == "__main__":
    main()
