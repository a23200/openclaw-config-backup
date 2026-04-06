#!/usr/bin/env python3
import asyncio
import base64
import json
import os
import sys
from pathlib import Path

from loguru import logger
from playwright.async_api import async_playwright

from db_manager import db_manager
from utils.captcha_remote_control import captcha_controller
from utils.yescaptcha_client import YesCaptchaClient


def build_cookie_list(cookie_value: str):
    cookies = []
    for cookie_pair in cookie_value.split(';'):
        cookie_pair = cookie_pair.strip()
        if '=' not in cookie_pair:
            continue
        name, value = cookie_pair.split('=', 1)
        cookies.append(
            {
                'name': name.strip(),
                'value': value.strip(),
                'domain': '.goofish.com',
                'path': '/',
            }
        )
    return cookies


async def extract_question(page):
    selectors = [
        '.captcha-title',
        '.captcha-text',
        '.captcha-dialog-title',
        '.desc',
        '.title',
        '[class*="captcha"] [class*="title"]',
        '[class*="captcha"] [class*="text"]',
    ]

    for selector in selectors:
        try:
            locator = page.locator(selector).first
            text = await locator.text_content(timeout=1000)
            if text and text.strip():
                return text.strip()
        except Exception:
            pass

    for frame in page.frames:
        if frame == page.main_frame:
            continue
        for selector in selectors:
            try:
                locator = frame.locator(selector).first
                text = await locator.text_content(timeout=1000)
                if text and text.strip():
                    return text.strip()
            except Exception:
                pass

    return ''


async def main(cookie_id: str, keyword: str):
    client_key = os.getenv('YESCAPTCHA_CLIENT_KEY')
    if not client_key:
        raise RuntimeError('Missing YESCAPTCHA_CLIENT_KEY')

    cookie_value = db_manager.get_all_cookies().get(cookie_id)
    if not cookie_value:
        raise RuntimeError(f'Cookie not found: {cookie_id}')

    out_dir = Path('tmp/yescaptcha-experiment')
    out_dir.mkdir(parents=True, exist_ok=True)

    yes = YesCaptchaClient(client_key)
    balance = await yes.get_balance()
    logger.info(f'YesCaptcha balance: {balance}')

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--lang=zh-CN',
                '--accept-lang=zh-CN,zh,en-US,en',
            ],
        )
        context = await browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
            viewport={'width': 1280, 'height': 720},
            locale='zh-CN',
        )
        page = await context.new_page()

        async def on_response(response):
            if 'idlemtopsearch.pc.search' in response.url or 'newslidecaptcha' in response.url or 'punishTextFetch' in response.url:
                logger.info(f'Network hit: {response.url}')

        page.on('response', on_response)

        await page.goto('https://www.goofish.com', timeout=30000)
        await context.add_cookies(build_cookie_list(cookie_value))
        await page.reload()
        await page.wait_for_load_state('networkidle', timeout=15000)

        await page.fill('input[class*="search-input"]', keyword)
        await page.keyboard.press('Enter')
        await page.wait_for_load_state('networkidle', timeout=20000)
        await asyncio.sleep(5)

        content = await page.content()
        logger.info(f'Page title: {await page.title()}')
        logger.info(f'Has scratch markers: {"scratch-captcha" in content or "newslidecaptcha" in content or "nocaptcha" in content}')

        captcha_info = await captcha_controller._get_captcha_info(page)
        logger.info(f'Captcha info: {captcha_info}')
        question = await extract_question(page)
        logger.info(f'Captcha question: {question!r}')

        if not captcha_info:
            screenshot_path = out_dir / 'full-page.jpg'
            await page.screenshot(path=str(screenshot_path), type='jpeg', quality=80, full_page=False)
            logger.warning(f'No captcha container found, screenshot saved to {screenshot_path}')
            return

        screenshot_bytes = await captcha_controller._screenshot_captcha_area(page, captcha_info)
        screenshot_path = out_dir / 'captcha.jpg'
        screenshot_path.write_bytes(screenshot_bytes)
        screenshot_b64 = base64.b64encode(screenshot_bytes).decode('utf-8')

        logger.info(f'Captcha screenshot saved to {screenshot_path}')

        session_id = f'{cookie_id}-search'
        session_data = await captcha_controller.create_session(session_id, page)
        control_url = f'http://127.0.0.1:8080/api/captcha/control/{session_id}'
        (out_dir / 'session_info.json').write_text(json.dumps({
            'session_id': session_id,
            'control_url': control_url,
            'captcha_info': session_data.get('captcha_info'),
            'viewport': session_data.get('viewport'),
            'question': question,
        }, ensure_ascii=False, indent=2))
        logger.info(f'Captcha session created: {session_id}')
        logger.info(f'Open control page: {control_url}')

        funcaptcha_result = await yes.solve_funcaptcha_classification(screenshot_b64, question or 'Pick the correct image')
        (out_dir / 'funcaptcha_result.json').write_text(json.dumps(funcaptcha_result, ensure_ascii=False, indent=2))
        logger.info(f'FunCaptcha result: {funcaptcha_result}')

        ocr_result = await yes.solve_image_to_text(screenshot_b64)
        (out_dir / 'ocr_result.json').write_text(json.dumps(ocr_result, ensure_ascii=False, indent=2))
        logger.info(f'OCR result: {ocr_result}')

        logger.info('Waiting for manual captcha handling. Press Ctrl+C to stop this helper.')
        while not captcha_controller.is_completed(session_id):
            await asyncio.sleep(1)

        logger.info('Captcha marked completed, closing helper browser')
        await captcha_controller.close_session(session_id)
        await context.close()
        await browser.close()


if __name__ == '__main__':
    cookie_id = sys.argv[1] if len(sys.argv) > 1 else '3083424450'
    keyword = sys.argv[2] if len(sys.argv) > 2 else 'iPhone 17'
    asyncio.run(main(cookie_id, keyword))
