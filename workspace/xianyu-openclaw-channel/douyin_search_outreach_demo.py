#!/usr/bin/env python3
import argparse
import asyncio
import json
import random
import re
from typing import Any

from playwright.async_api import async_playwright

AI_KEYWORDS = ["ai", "AI", "人工智能", "副业", "变现", "教程", "软件", "工具", "自动化", "提示词"]
INTENT_PATTERNS = [r"求", r"怎么", r"多少钱", r"链接", r"私信", r"带带", r"想学", r"想做", r"教我", r"有吗"]

def score_text(text: str) -> float:
    score = 0.0
    lowered = text.lower()
    for keyword in AI_KEYWORDS:
        if keyword.lower() in lowered:
            score += 0.18
    for pattern in INTENT_PATTERNS:
        if re.search(pattern, text, flags=re.IGNORECASE):
            score += 0.35
    return min(score, 1.0)

async def find_video_entries(page, max_videos: int) -> list[dict[str, Any]]:
    selectors = [
        "a[href*='/video/']",
        "[data-e2e='search-card'] a",
        "div[data-e2e*='search'] a[href*='modal_id']",
    ]
    videos = []
    seen = set()

    for _ in range(6):
        for selector in selectors:
            try:
                links = await page.locator(selector).all()
            except Exception:
                continue
            for link in links:
                try:
                    href = await link.get_attribute("href")
                    text = (await link.inner_text()).strip()
                except Exception:
                    continue
                href = href or ""
                if not href or href in seen:
                    continue
                seen.add(href)
                videos.append({"url": href, "title": text[:120]})
                if len(videos) >= max_videos:
                    return videos
        await page.mouse.wheel(0, random.randint(1200, 2200))
        await page.wait_for_timeout(random.randint(1200, 2200))
    return videos

async def open_video_target(page, target_url: str) -> None:
    await page.goto(target_url, wait_until="domcontentloaded", timeout=60000)
    await page.wait_for_timeout(4000)

async def collect_comments_from_modal(page, max_leads: int) -> list[dict[str, Any]]:
    comment_selectors = [
        "[data-e2e='comment-item']",
        "[class*='comment-item']",
        "[class*='CommentItem']",
        "div[class*='comment']",
    ]
    leads = []
    seen = set()

    for _ in range(8):
        for selector in comment_selectors:
            try:
                nodes = await page.locator(selector).all()
            except Exception:
                continue
            for node in nodes:
                try:
                    text = (await node.inner_text()).strip()
                except Exception:
                    continue
                if not text or text in seen:
                    continue
                seen.add(text)
                score = score_text(text)
                if score < 0.35:
                    continue
                leads.append({"comment_text": text, "intent_score": score})
                if len(leads) >= max_leads:
                    return leads
        await page.mouse.wheel(0, random.randint(900, 1600))
        await page.wait_for_timeout(random.randint(1200, 2200))
    return leads

async def main():
    parser = argparse.ArgumentParser(description="抖音 AI 搜索页评论抓取雏形")
    parser.add_argument("search_url", help="抖音搜索页/弹层页 URL")
    parser.add_argument("--max-videos", type=int, default=5)
    parser.add_argument("--max-leads", type=int, default=20)
    args = parser.parseargs() if hasattr(parser, "parseargs") else parser.parse_args()

    async with async_playwright() as playwright:
        print("[*] 正在连接本地已打开的 Chrome (http://localhost:9222)...")
        try:
            browser = await playwright.chromium.connect_over_cdp("http://localhost:9222")
            contexts = browser.contexts
            if not contexts:
                context = await browser.new_context()
            else:
                context = contexts[0]
            
            pages = context.pages
            if not pages:
                page = await context.new_page()
            else:
                page = pages[0]
                await page.bring_to_front()

            print(f"[*] 正在访问目标链接: {args.search_url}")
            await open_video_target(page, args.search_url)
            
            print("[*] 正在扫描视频列表...")
            videos = await find_video_entries(page, args.max_videos)
            
            print("[*] 正在扫描评论区...")
            leads = await collect_comments_from_modal(page, args.max_leads)

            output = {
                "searchUrl": args.search_url,
                "videoCandidates": videos,
                "leads": leads,
            }
            
            print("\n" + "="*40)
            print(json.dumps(output, ensure_ascii=False, indent=2))
            print("="*40 + "\n")
            
            print("[*] 抓取完成。断开浏览器连接。")
            
        except Exception as e:
            print(f"\n[❌ 致命错误] 无法连接到本地浏览器: {e}")
            print("\n【必须确保调试端口已开启】")
            print("请先完全退出 Chrome (Command+Q)，然后在终端执行：")
            print('pkill -f "Google Chrome"; open -a "Google Chrome" --args --remote-debugging-port=9222')
            print("重新打开后随便进一个页面，然后再告诉我继续。\n")

if __name__ == "__main__":
    asyncio.run(main())
