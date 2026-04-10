#!/usr/bin/env python3
import argparse
import asyncio
import json
import random
import re
from typing import Any

from loguru import logger
from playwright.async_api import async_playwright

AI_KEYWORDS = ["ai", "AI", "人工智能", "副业", "变现", "教程", "工作流", "软件", "提示词", "自动化"]
INTENT_PATTERNS = [r"求", r"怎么", r"多少钱", r"链接", r"带带", r"私信", r"想学", r"想做", r"教我"]


def score_comment(text: str) -> float:
    score = 0.0
    lowered = text.lower()
    for keyword in AI_KEYWORDS:
        if keyword.lower() in lowered:
            score += 0.2
    for pattern in INTENT_PATTERNS:
        if re.search(pattern, text, flags=re.IGNORECASE):
            score += 0.35
    return min(score, 1.0)


async def collect_douyin_comments(page, max_leads: int) -> list[dict[str, Any]]:
    selectors = [
        "[data-e2e='comment-item']",
        "[class*='comment-item']",
        "[class*='CommentItem']",
        "div[class*='comment']",
    ]

    leads = []
    seen = set()
    for _ in range(8):
        for selector in selectors:
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
                score = score_comment(text)
                if score < 0.35:
                    continue
                leads.append({
                    "comment_text": text,
                    "intent_score": score,
                })
                if len(leads) >= max_leads:
                    return leads

        await page.mouse.wheel(0, random.randint(900, 1600))
        await page.wait_for_timeout(random.randint(1500, 2500))
    return leads


async def try_open_profile_and_dm(page, message: str) -> dict[str, Any]:
    result = {"profileOpened": False, "dmOpened": False, "sent": False}
    avatar_selectors = [
        "a[href*='user']",
        "[data-e2e='comment-avatar']",
        "[class*='avatar']",
    ]
    for selector in avatar_selectors:
        try:
            locator = page.locator(selector).first
            if await locator.count() == 0:
                continue
            await locator.click(timeout=3000)
            result["profileOpened"] = True
            break
        except Exception:
            continue

    if not result["profileOpened"]:
        return result

    await page.wait_for_timeout(2500)

    dm_selectors = [
        "text=私信",
        "text=发私信",
        "button:has-text('私信')",
        "a:has-text('私信')",
    ]
    for selector in dm_selectors:
        try:
            locator = page.locator(selector).first
            if await locator.count() == 0:
                continue
            await locator.click(timeout=3000)
            result["dmOpened"] = True
            break
        except Exception:
            continue

    if not result["dmOpened"]:
        return result

    await page.wait_for_timeout(2000)

    input_selectors = [
        "textarea",
        "div[contenteditable='true']",
        "[class*='public-DraftEditor-content']",
    ]
    for selector in input_selectors:
        try:
            locator = page.locator(selector).first
            if await locator.count() == 0:
                continue
            await locator.fill(message)
            break
        except Exception:
            continue

    send_selectors = [
        "text=发送",
        "button:has-text('发送')",
    ]
    for selector in send_selectors:
        try:
            locator = page.locator(selector).first
            if await locator.count() == 0:
                continue
            await locator.click(timeout=3000)
            result["sent"] = True
            break
        except Exception:
            continue

    return result


async def main():
    parser = argparse.ArgumentParser(description="抖音 AI 视频评论引流雏形")
    parser.add_argument("target_url", help="抖音视频主页 URL")
    parser.add_argument("--message", required=True, help="私信内容")
    parser.add_argument("--max-leads", type=int, default=10)
    parser.add_argument("--send", action="store_true")
    parser.add_argument("--storage-state", default="", help="已登录抖音的 Playwright storageState JSON")
    args = parser.parse_args()

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=False)
        context_kwargs = {"viewport": {"width": 1440, "height": 900}}
        if args.storage_state:
            context_kwargs["storage_state"] = args.storage_state
        context = await browser.new_context(**context_kwargs)
        page = await context.new_page()
        await page.goto(args.target_url, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(5000)

        leads = await collect_douyin_comments(page, args.max_leads)
        output = {"targetUrl": args.target_url, "leads": leads, "actions": []}

        if args.send and leads:
            action = await try_open_profile_and_dm(page, args.message)
            output["actions"].append(action)

        print(json.dumps(output, ensure_ascii=False, indent=2))
        await context.close()
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
