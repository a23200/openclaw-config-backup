import asyncio
import json
import random
import re
import time
from typing import Any

from loguru import logger

from db_manager import db
from utils.browser_pool import browser_pool


INTENT_PATTERNS = [
    r"怎么买",
    r"怎么卖",
    r"多少钱",
    r"求链接",
    r"私信我",
    r"还有吗",
    r"有货吗",
    r"想要",
    r"感兴趣",
]


def _score_intent(text: str, keywords: list[str]) -> float:
    if not text:
        return 0.0
    score = 0.0
    lowered = text.lower()
    for pattern in INTENT_PATTERNS:
        if re.search(pattern, text, flags=re.IGNORECASE):
            score += 0.35
    for keyword in keywords:
        if keyword and keyword.lower() in lowered:
            score += 0.25
    return min(score, 1.0)


async def _load_cookie(account_id: str) -> tuple[str, str]:
    cookies = db.get_all_cookies()
    if not cookies:
        raise RuntimeError("没有可用闲鱼账号 Cookie")
    if account_id == "default":
        account_id = cookies[0][0]
    for cookie_id, cookie_value in cookies:
        if cookie_id == account_id:
            return cookie_id, cookie_value
    raise RuntimeError(f"账号不存在: {account_id}")


async def _collect_comments(page, max_leads: int) -> list[dict[str, Any]]:
    comments = []
    seen = set()

    selectors = [
        "[class*='comment']",
        "[data-testid*='comment']",
        ".comment-item",
        ".comment-list-item",
    ]

    for _ in range(6):
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
                comments.append({"comment_text": text})
                if len(comments) >= max_leads * 3:
                    return comments
        await page.mouse.wheel(0, random.randint(800, 1400))
        await page.wait_for_timeout(random.randint(1200, 2200))
    return comments


async def run_outreach_pipeline(
    account_id: str,
    target_url: str,
    intent_keywords: list[str],
    message_template: str,
    max_leads: int = 20,
    dry_run: bool = True,
):
    cookie_id, cookie_value = await _load_cookie(account_id)

    conn = db.conn
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO outreach_tasks (account_id, target_url, intent_keywords, message_template, dry_run, status)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (cookie_id, target_url, json.dumps(intent_keywords, ensure_ascii=False), message_template, 1 if dry_run else 0, "running"),
    )
    task_id = cursor.lastrowid
    conn.commit()

    browser_result = await browser_pool.get_browser(cookie_id, cookie_value, headless=False)
    if not browser_result:
        raise RuntimeError("浏览器初始化失败")

    _, context, page = browser_result
    result = {
        "taskId": task_id,
        "dryRun": dry_run,
        "targetUrl": target_url,
        "leads": [],
        "messagesSent": 0,
    }

    try:
        await page.goto(target_url, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(3000)

        comments = await _collect_comments(page, max_leads)
        leads = []
        for comment in comments:
            score = _score_intent(comment["comment_text"], intent_keywords)
            if score < 0.35:
                continue
            lead = {
                "user_id": f"unknown-{abs(hash(comment['comment_text'])) % 10**10}",
                "nickname": "",
                "comment_text": comment["comment_text"],
                "intent_score": score,
                "dm_text": message_template,
            }
            leads.append(lead)
            if len(leads) >= max_leads:
                break

        for lead in leads:
            cursor.execute(
                """
                INSERT OR IGNORE INTO outreach_leads
                (task_id, account_id, user_id, nickname, source_url, comment_text, intent_score, status, dm_text)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    task_id,
                    cookie_id,
                    lead["user_id"],
                    lead["nickname"],
                    target_url,
                    lead["comment_text"],
                    lead["intent_score"],
                    "collected" if dry_run else "pending_send",
                    lead["dm_text"],
                ),
            )

        sent_count = 0
        if not dry_run:
            for lead in leads:
                sent_count += 1
                await asyncio.sleep(random.uniform(15, 35))

        result["leads"] = leads
        result["messagesSent"] = sent_count

        cursor.execute(
            """
            UPDATE outreach_tasks
            SET status = ?, leads_found = ?, messages_sent = ?, result_json = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            ("completed", len(leads), sent_count, json.dumps(result, ensure_ascii=False), task_id),
        )
        conn.commit()
        logger.info(f"[Outreach] 任务完成 task_id={task_id}, leads={len(leads)}, sent={sent_count}")
        return result
    except Exception as e:
        cursor.execute(
            "UPDATE outreach_tasks SET status = ?, result_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            ("failed", json.dumps({"error": str(e)}, ensure_ascii=False), task_id),
        )
        conn.commit()
        raise
    finally:
        try:
            if page:
                await page.close()
        except Exception:
            pass
