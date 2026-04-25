"""Drive Douyin upload over CDP (Chrome DevTools Protocol).

Attaches to a long-lived dedicated debug Chrome instance running with
`--remote-debugging-port=9222 --user-data-dir=~/.jimeng-publish-chrome`.

The user logs into Douyin once in that Chrome window; cookies/localStorage
persist in the fixed user-data-dir, so every subsequent publish just opens a
new tab in that same Chrome and reuses the existing login state.

Selectors/wait text ported from
/Users/mac/.agents/skills/douyin-creator-tools/src/publish-douyin-video.mjs
"""
from __future__ import annotations

import json
import re
import time
import urllib.request
import urllib.parse
from pathlib import Path
from typing import Any

from playwright.sync_api import sync_playwright, Page, BrowserContext, Error as PlaywrightError

DOUYIN_UPLOAD_URL = 'https://creator.douyin.com/creator-micro/content/upload'
PUBLISH_LINK_RE = re.compile(r'https?://(?:[a-z]+\.)?(?:douyin|iesdouyin)\.com/\S+', re.I)
DEFAULT_CDP_ENDPOINT = 'http://127.0.0.1:9222'

# Injected before every page load to mask the usual Playwright/CDP fingerprints
# that Douyin风控 probes.
STEALTH_INIT_SCRIPT = r"""
(() => {
  try {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  } catch (e) {}
  try {
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en-US', 'en'] });
  } catch (e) {}
  try {
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5].map(() => ({ name: '', description: '', filename: '' })),
    });
  } catch (e) {}
  try {
    // Make window.chrome look populated (headless leaves this bare).
    if (!window.chrome) window.chrome = {};
    if (!window.chrome.runtime) window.chrome.runtime = {};
  } catch (e) {}
  try {
    // Permissions.query must not reveal 'denied' for 'notifications' in a way
    // that only happens under automation.
    const origQuery = window.navigator.permissions && window.navigator.permissions.query;
    if (origQuery) {
      window.navigator.permissions.query = (params) =>
        params && params.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : origQuery(params);
    }
  } catch (e) {}
})();
"""


def _log(lines: list[str], msg: str) -> None:
    lines.append(f'[{time.strftime("%H:%M:%S")}] {msg}')


def _find_publish_link(text: str) -> str:
    m = PUBLISH_LINK_RE.search(text or '')
    return m.group(0).rstrip('.,，。；;)') if m else ''


def _read_publish_input(config_path: Path) -> dict[str, Any]:
    data = json.loads(config_path.read_text(encoding='utf-8'))
    return {
        'videoPath': data.get('videoPath', ''),
        'title': data.get('title', ''),
        'description': data.get('description', ''),
        'tags': data.get('tags') or [],
        'coverPath': data.get('coverPath', ''),
    }


def _build_caption(inp: dict[str, Any]) -> str:
    tags = ' '.join(f'#{t}' for t in inp['tags'] if t)
    parts = [p for p in [inp['description'], tags] if p]
    return ' '.join(parts) or inp['title']


def _pick_context(contexts: list[BrowserContext]) -> BrowserContext:
    """Prefer the default (non-incognito) context that has cookies. CDP-attached
    Chrome always exposes the default context as contexts[0]."""
    if not contexts:
        raise RuntimeError('CDP attach succeeded but no browser context was returned')
    return contexts[0]


def _ensure_page_target(endpoint: str, fallback_url: str = 'about:blank') -> int:
    """Playwright's connect_over_cdp fails with `Browser context management is
    not supported` when Chrome has zero page targets. Use raw CDP /json/list
    + /json/new to guarantee at least one tab exists before attach.

    Returns the number of tabs after ensuring. Safe to call every time.
    """
    base = endpoint.rstrip('/')
    try:
        with urllib.request.urlopen(f'{base}/json/list', timeout=3) as r:
            targets = json.loads(r.read().decode('utf-8'))
        page_targets = [t for t in targets if t.get('type') == 'page']
        if page_targets:
            return len(page_targets)
    except (urllib.error.URLError, ValueError, OSError, TimeoutError):
        return 0
    try:
        encoded = urllib.parse.quote(fallback_url, safe=':/?&=')
        urllib.request.urlopen(urllib.request.Request(f'{base}/json/new?{encoded}', method='PUT'), timeout=5)
    except Exception:
        pass
    try:
        with urllib.request.urlopen(f'{base}/json/list', timeout=3) as r:
            targets = json.loads(r.read().decode('utf-8'))
        return len([t for t in targets if t.get('type') == 'page'])
    except Exception:
        return 0


def publish_via_cdp(folder: Path, config_path: Path, endpoint: str = DEFAULT_CDP_ENDPOINT) -> dict[str, Any]:
    log_path = folder / 'douyin_publish.log'
    started = time.time()
    log_lines: list[str] = []
    result: dict[str, Any] = {
        'started_at': started,
        'ended_at': None,
        'elapsed_sec': None,
        'status': 'running',
        'exit_code': None,
        'error': '',
        'link': '',
        'backend': 'cdp',
        'endpoint': endpoint,
        'config': str(config_path),
    }

    try:
        inp = _read_publish_input(config_path)
        if not inp['videoPath'] or not Path(inp['videoPath']).exists():
            raise FileNotFoundError(f'视频文件不存在: {inp["videoPath"]}')
        _log(log_lines, f'backend=cdp · endpoint={endpoint} · video={inp["videoPath"]}')

        pages_before = _ensure_page_target(endpoint)
        _log(log_lines, f'pre-attach: {pages_before} page target(s) present')

        with sync_playwright() as pw:
            _log(log_lines, 'connect_over_cdp ...')
            browser = pw.chromium.connect_over_cdp(endpoint, timeout=15000)
            try:
                context = _pick_context(browser.contexts)
                _log(log_lines, f'attached · contexts={len(browser.contexts)} · pages={len(context.pages)}')

                # Hide automation fingerprints before any page script runs.
                # Douyin风控's first checks: navigator.webdriver, chrome.runtime,
                # plugins/languages arrays. These init scripts run on every
                # new document in this context, so they apply to the upload
                # page and any iframes it spawns.
                context.add_init_script(STEALTH_INIT_SCRIPT)

                page = context.new_page()
                _log(log_lines, f'new tab opened · total tabs now={len(context.pages)}')
                page.set_default_timeout(60000)

                _log(log_lines, f'navigate → {DOUYIN_UPLOAD_URL}')
                page.goto(DOUYIN_UPLOAD_URL, wait_until='domcontentloaded')

                _log(log_lines, 'wait for file input (max 20s)')
                file_input = page.locator('input[type="file"]').first
                file_input.wait_for(state='attached', timeout=20000)

                _log(log_lines, 'set video file')
                file_input.set_input_files(inp['videoPath'])

                _log(log_lines, 'wait 25s for upload + parse')
                page.wait_for_timeout(25000)

                caption = _build_caption(inp)
                _log(log_lines, f'fill caption ({len(caption)} chars)')
                _fill_caption(page, caption, log_lines)

                cover = inp.get('coverPath')
                if cover and Path(cover).exists():
                    _try_set_cover(page, cover, log_lines)

                _log(log_lines, 'wait 1.5s before publish')
                page.wait_for_timeout(1500)

                _log(log_lines, 'click 发布')
                _click_publish(page, log_lines)

                _log(log_lines, 'wait 8s for navigation / result')
                page.wait_for_timeout(8000)

                try:
                    text = page.content()
                    link = _find_publish_link(text)
                    if link:
                        result['link'] = link
                        _log(log_lines, f'link: {link}')
                except PlaywrightError as exc:
                    _log(log_lines, f'read page for link skipped: {exc}')

                result['status'] = 'ok'
                result['exit_code'] = 0
                _log(log_lines, '🎉 publish flow submitted OK')
            finally:
                # IMPORTANT: close only the Playwright side. This disconnects CDP
                # but leaves the real Chrome process (and our tab) running.
                try:
                    browser.close()
                except Exception:
                    pass

    except PlaywrightError as exc:
        result['status'] = 'failed'
        result['error'] = str(exc)[:800]
        _log(log_lines, f'FAILED (playwright): {exc}')
    except Exception as exc:
        result['status'] = 'failed'
        result['error'] = f'{type(exc).__name__}: {exc}'
        _log(log_lines, f'FAILED: {type(exc).__name__}: {exc}')

    ended = time.time()
    result['ended_at'] = ended
    result['elapsed_sec'] = round(ended - started, 2)
    try:
        log_path.write_text('\n'.join(log_lines) + '\n', encoding='utf-8')
    except Exception:
        pass
    return result


def _fill_caption(page: Page, caption: str, log_lines: list[str]) -> None:
    # Primary: Douyin's zone-container contenteditable. Fallback: any contenteditable.
    for selector in ('.zone-container [contenteditable="true"]', '[contenteditable="true"]'):
        try:
            box = page.locator(selector).first
            box.wait_for(state='visible', timeout=10000)
            box.click()
            box.press('Meta+A')
            box.press('Backspace')
            box.type(caption, delay=12)
            _log(log_lines, f'caption filled via {selector}')
            return
        except PlaywrightError as exc:
            _log(log_lines, f'caption selector {selector} failed: {exc}')
    raise RuntimeError('无法找到抖音标题/描述输入框（.zone-container 和 [contenteditable] 都不可用）')


def _try_set_cover(page: Page, cover_path: str, log_lines: list[str]) -> None:
    """Best-effort cover upload. Cover modal confirm button is '保存' (red
    primary). Keep 完成/确定/确认 as fallbacks for older变体."""
    try:
        inputs = page.locator('input[type="file"]').all()
        target = None
        for inp in inputs:
            accept = inp.get_attribute('accept') or ''
            if 'image' in accept:
                target = inp
                break
        if target is None and len(inputs) >= 2:
            target = inputs[1]
        if target is None:
            _log(log_lines, 'cover skipped: no image file input found')
            return
        target.set_input_files(cover_path)
        _log(log_lines, f'cover uploaded: {cover_path}')
        # Wait for the cover modal ("设置封面") to render + image to parse
        page.wait_for_timeout(3500)
        for label in ('保存', '完成', '确定', '确认'):
            try:
                btn = page.get_by_role('button', name=label, exact=True).first
                btn.wait_for(state='visible', timeout=4000)
                btn.click()
                _log(log_lines, f'cover modal confirmed via "{label}"')
                # Wait for modal to actually close
                try:
                    page.wait_for_selector('text=设置封面', state='detached', timeout=6000)
                except PlaywrightError:
                    page.wait_for_timeout(1500)
                return
            except PlaywrightError:
                continue
        _log(log_lines, 'cover modal confirm button not found (may be auto-closed)')
    except PlaywrightError as exc:
        _log(log_lines, f'cover skipped: {exc}')


def _click_publish(page: Page, log_lines: list[str]) -> None:
    """Click the bottom '发布' button. NOT the sidebar '高清发布' entry — we
    match the button name exactly and pick the last visible one after scrolling
    the page bottom into view."""
    try:
        page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
        page.wait_for_timeout(600)
    except PlaywrightError:
        pass

    last_err: Exception | None = None
    strategies = (
        ('role-exact-last', lambda: page.get_by_role('button', name='发布', exact=True).last),
        ('css-exact-last', lambda: page.locator('button').filter(has_text=re.compile(r'^\s*发布\s*$')).last),
        ('role-exact-first', lambda: page.get_by_role('button', name='发布', exact=True).first),
    )
    for name, locate in strategies:
        try:
            btn = locate()
            btn.scroll_into_view_if_needed(timeout=3000)
            btn.wait_for(state='visible', timeout=5000)
            btn.click()
            _log(log_lines, f'publish clicked via {name}')
            return
        except PlaywrightError as exc:
            last_err = exc
            _log(log_lines, f'publish strategy {name} failed: {str(exc)[:160]}')
            continue
    raise RuntimeError(f'找不到"发布"按钮：{last_err}')
