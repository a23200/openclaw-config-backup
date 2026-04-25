import asyncio
import os
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from loguru import logger

from db_manager import db_manager

try:
    from playwright.async_api import async_playwright
except Exception:  # pragma: no cover - 运行环境缺少 playwright 时降级
    async_playwright = None


SESSION_LIST_SELECTOR = "div[class*='conversation-item--']"
SESSION_SCROLL_SELECTOR = "div.rc-virtual-list-holder"
MESSAGE_ROW_SELECTOR = "main li.ant-list-item"
SYNC_IM_URL = "https://www.goofish.com/im#codex-sync"


VISIBLE_SESSIONS_JS = r"""
() => {
  function extractSessionInfo(node) {
    const fiberKey = Object.getOwnPropertyNames(node).find((key) => key.startsWith('__reactFiber$'));
    if (!fiberKey) return null;
    const seen = new WeakSet();
    let found = null;
    function walk(obj, depth = 0) {
      if (!obj || typeof obj !== 'object' || depth > 8 || seen.has(obj) || found) return;
      seen.add(obj);
      if (obj.sessionInfo && typeof obj.sessionInfo === 'object' && obj.sessionInfo.sessionId) {
        found = obj.sessionInfo;
        return;
      }
      for (const value of Object.values(obj)) {
        if (value && typeof value === 'object') walk(value, depth + 1);
        if (found) return;
      }
    }
    walk(node[fiberKey]);
    return found;
  }

  return Array.from(document.querySelectorAll("div[class*='conversation-item--']")).map((node, index) => {
    const sessionInfo = extractSessionInfo(node);
    const lines = (node.innerText || '')
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean);
    return {
      visible_index: index,
      session_id: String(sessionInfo?.sessionId || ''),
      session_type: sessionInfo?.sessionType ?? null,
      selected: (node.className || '').includes('conversation-item-active'),
      name: lines[0] || '',
      summary_text: sessionInfo?.summary?.summaryContent || lines[1] || '',
      red_reminder: sessionInfo?.summary?.redReminder || '',
      summary_timestamp: Number(sessionInfo?.summary?.timeStamp || 0),
      item_id: String(sessionInfo?.itemInfo?.itemId || ''),
      item_title: sessionInfo?.itemInfo?.title || '',
      item_image: sessionInfo?.itemInfo?.mainPic || '',
      user_id: String(sessionInfo?.userInfo?.userId || ''),
      owner_id: String(sessionInfo?.ownerInfo?.userId || ''),
    };
  });
}
"""


ACTIVE_SESSION_JS = r"""
() => {
  const node = Array.from(document.querySelectorAll("div[class*='conversation-item--']")).find(
    (item) => (item.className || '').includes('conversation-item-active--')
  );
  if (!node) return '';

  const fiberKey = Object.getOwnPropertyNames(node).find((key) => key.startsWith('__reactFiber$'));
  if (!fiberKey) return '';

  const seen = new WeakSet();
  let sessionId = '';
  function walk(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 8 || seen.has(obj) || sessionId) return;
    seen.add(obj);
    if (obj.sessionInfo && obj.sessionInfo.sessionId) {
      sessionId = String(obj.sessionInfo.sessionId);
      return;
    }
    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object') walk(value, depth + 1);
      if (sessionId) return;
    }
  }
  walk(node[fiberKey]);
  return sessionId;
}
"""


CLICK_SESSION_JS = r"""
(targetSessionId) => {
  function extractSessionInfo(node) {
    const fiberKey = Object.getOwnPropertyNames(node).find((key) => key.startsWith('__reactFiber$'));
    if (!fiberKey) return null;
    const seen = new WeakSet();
    let found = null;
    function walk(obj, depth = 0) {
      if (!obj || typeof obj !== 'object' || depth > 8 || seen.has(obj) || found) return;
      seen.add(obj);
      if (obj.sessionInfo && typeof obj.sessionInfo === 'object' && obj.sessionInfo.sessionId) {
        found = obj.sessionInfo;
        return;
      }
      for (const value of Object.values(obj)) {
        if (value && typeof value === 'object') walk(value, depth + 1);
        if (found) return;
      }
    }
    walk(node[fiberKey]);
    return found;
  }

  const target = String(targetSessionId || '');
  const nodes = Array.from(document.querySelectorAll("div[class*='conversation-item--']"));
  for (const node of nodes) {
    const sessionInfo = extractSessionInfo(node);
    if (String(sessionInfo?.sessionId || '') === target) {
      node.click();
      return true;
    }
  }
  return false;
}
"""


THREAD_MESSAGES_JS = r"""
() => {
  function extractMessage(node) {
    const fiberKey = Object.getOwnPropertyNames(node).find((key) => key.startsWith('__reactFiber$'));
    if (!fiberKey) return null;
    const seen = new WeakSet();
    let found = null;
    function walk(obj, depth = 0) {
      if (!obj || typeof obj !== 'object' || depth > 8 || seen.has(obj) || found) return;
      seen.add(obj);
      if (obj.message && typeof obj.message === 'object' && (obj.message.messageId || obj.message.timeStamp || obj.message.createAt)) {
        found = obj.message;
        return;
      }
      for (const value of Object.values(obj)) {
        if (value && typeof value === 'object') walk(value, depth + 1);
        if (found) return;
      }
    }
    walk(node[fiberKey]);
    return found;
  }

  return Array.from(document.querySelectorAll('main li.ant-list-item')).map((node, index) => {
    const message = extractMessage(node);
    if (!message || !message.messageId) return null;
    const style = node.getAttribute('style') || '';
    return {
      visible_index: index,
      row_text: (node.innerText || '').trim().replace(/\n+/g, ' | '),
      direction: style.includes('rtl') ? 'rtl' : 'ltr',
      message_id: String(message.messageId || ''),
      session_id: String(message.sessionId || message.cid?.split('@')[0] || ''),
      timestamp: Number(message.timeStamp || message.createAt || 0),
      sender_user_id: String(
        message.senderInfo?.userId
          || message.sender?.uid?.split('@')[0]
          || message.extension?.senderUserId
          || ''
      ),
      content_type: Number(
        message.content?.contentType
          ?? message.content?.custom?.type
          ?? -1
      ),
      text: message.content?.text?.text || '',
      audio_duration: Number(message.content?.audio?.duration || 0),
      audio_url: message.content?.audio?.url || '',
      reminder_content: message.reminder?.content || message.extension?.reminderContent || '',
      detail_notice: message.reminder?.detailNotice || message.extension?.detailNotice || '',
    };
  }).filter(Boolean);
}
"""


_cookie_sync_locks: Dict[str, threading.Lock] = {}
_cookie_sync_locks_guard = threading.Lock()
_recent_sync_at: Dict[str, float] = {}
_chat_sync_at: Dict[Tuple[str, str], float] = {}


def _get_cookie_lock(cookie_id: str) -> threading.Lock:
    with _cookie_sync_locks_guard:
        if cookie_id not in _cookie_sync_locks:
            _cookie_sync_locks[cookie_id] = threading.Lock()
        return _cookie_sync_locks[cookie_id]


def _as_local_datetime_text(timestamp_ms: int) -> Optional[str]:
    if not timestamp_ms:
        return None
    try:
        return time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(timestamp_ms / 1000))
    except Exception:
        return None


def _normalize_message_text(message: Dict[str, Any]) -> str:
    text = str(message.get('text') or '').strip()
    if text:
        return text

    content_type = int(message.get('content_type') or 0)
    detail_notice = str(message.get('detail_notice') or '').strip()
    reminder_content = str(message.get('reminder_content') or '').strip()

    if content_type == 3 or message.get('audio_url'):
        return '[语音消息]'
    if content_type == 2:
        return '[图片]'
    if detail_notice in {'[语音]', '语音'} or reminder_content in {'[语音]', '语音'}:
        return '[语音消息]'
    if detail_notice:
        return detail_notice
    if reminder_content:
        return reminder_content
    return ''


def _resolve_counterparty(cookie_id: str, session_meta: Dict[str, Any]) -> Tuple[str, str]:
    own_user_id = str(cookie_id or '').strip()
    session_user_id = str(session_meta.get('user_id') or '').strip()
    owner_id = str(session_meta.get('owner_id') or '').strip()
    if session_user_id and session_user_id != own_user_id:
        return session_user_id, str(session_meta.get('name') or '').strip()
    if owner_id and owner_id != own_user_id:
        return owner_id, str(session_meta.get('name') or '').strip()
    return session_user_id or owner_id, str(session_meta.get('name') or '').strip()


class ConversationBrowserSync:
    def __init__(self, cookie_id: str):
        self.cookie_id = str(cookie_id or '').strip()
        self.playwright = None
        self.browser = None
        self.page = None

    async def __aenter__(self):
        await self._connect()
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.close()

    async def close(self):
        if self.playwright:
            try:
                await self.playwright.stop()
            except Exception as error:
                logger.debug(f"【{self.cookie_id}】关闭同步 playwright 失败: {error}")
        self.playwright = None
        self.browser = None
        self.page = None

    async def _resolve_local_browser_cdp_ws(self) -> str:
        configured = str(
            os.getenv('LOCAL_BROWSER_CDP_URL')
            or os.getenv('GOOFISH_LOCAL_BROWSER_CDP_URL')
            or 'http://127.0.0.1:9222'
        ).strip()
        if configured.startswith('ws://') or configured.startswith('wss://'):
            return configured

        active_port_file = Path.home() / 'Library/Application Support/Google/Chrome/DevToolsActivePort'
        if active_port_file.exists():
            lines = [line.strip() for line in active_port_file.read_text().splitlines() if line.strip()]
            if len(lines) >= 2:
                return f'ws://127.0.0.1:{lines[0]}{lines[1]}'

        if configured.startswith('http://') or configured.startswith('https://'):
            return configured
        return 'http://127.0.0.1:9222'

    async def _connect(self):
        if async_playwright is None:
            raise RuntimeError('playwright 未安装，无法接管本机 Chrome 聊天页')

        errors: List[str] = []
        for attempt in range(1, 4):
            ws_or_http = await self._resolve_local_browser_cdp_ws()
            try:
                self.playwright = await async_playwright().start()
                self.browser = await self.playwright.chromium.connect_over_cdp(ws_or_http)
                self.page = await self._ensure_sync_page()
                return
            except Exception as error:
                errors.append(f'第{attempt}次连接失败: {error}')
                logger.warning(f"【{self.cookie_id}】连接本机 Chrome 失败，第{attempt}次重试: {error}")
                self.browser = None
                if self.playwright:
                    try:
                        await self.playwright.stop()
                    except Exception:
                        pass
                self.playwright = None
                await asyncio.sleep(min(1.2 * attempt, 3))
        raise RuntimeError('；'.join(errors) or '连接本机 Chrome 失败')

    async def _ensure_sync_page(self):
        for context in self.browser.contexts:
            for page in context.pages:
                if 'goofish.com/im#codex-sync' in page.url:
                    await page.wait_for_timeout(300)
                    await self._wait_page_ready(page)
                    return page

        context = self.browser.contexts[0] if self.browser.contexts else await self.browser.new_context()
        page = await context.new_page()
        await page.goto(SYNC_IM_URL, wait_until='domcontentloaded', timeout=20000)
        await self._wait_page_ready(page)
        return page

    async def _wait_page_ready(self, page):
        await page.wait_for_timeout(1200)
        await page.wait_for_selector(SESSION_SCROLL_SELECTOR, timeout=15000)
        await page.wait_for_selector('main', timeout=15000)

    async def _extract_visible_sessions(self) -> List[Dict[str, Any]]:
        return await self.page.evaluate(VISIBLE_SESSIONS_JS)

    async def _get_active_session_id(self) -> str:
        return await self.page.evaluate(ACTIVE_SESSION_JS)

    async def _click_session(self, chat_id: str) -> bool:
        return await self.page.evaluate(CLICK_SESSION_JS, str(chat_id))

    async def _find_and_select_session(self, chat_id: str) -> Optional[Dict[str, Any]]:
        target = str(chat_id or '').strip()
        if not target:
            return None

        await self.page.evaluate(
            f"() => {{ const el = document.querySelector('{SESSION_SCROLL_SELECTOR}'); if (el) el.scrollTop = 0; }}"
        )
        await self.page.wait_for_timeout(400)

        visited = set()
        for _ in range(18):
            visible = await self._extract_visible_sessions()
            if visible:
                cursor = (visible[0].get('session_id'), visible[-1].get('session_id'))
                if cursor in visited:
                    break
                visited.add(cursor)

            for session in visible:
                if str(session.get('session_id') or '') == target:
                    clicked = await self._click_session(target)
                    if clicked:
                        for _ in range(20):
                            await self.page.wait_for_timeout(150)
                            active_session_id = await self._get_active_session_id()
                            if active_session_id == target:
                                await self.page.wait_for_timeout(900)
                                return session
                    return session

            await self.page.evaluate(
                f"() => {{ const el = document.querySelector('{SESSION_SCROLL_SELECTOR}'); if (el) el.scrollTop += Math.max(el.clientHeight * 0.85, 320); }}"
            )
            await self.page.wait_for_timeout(500)
        return None

    async def _extract_thread_messages(self) -> List[Dict[str, Any]]:
        await self.page.wait_for_selector(MESSAGE_ROW_SELECTOR, timeout=8000)
        await self.page.wait_for_timeout(600)
        return await self.page.evaluate(THREAD_MESSAGES_JS)

    async def sync_recent_sessions(self, max_sessions: int = 6) -> Dict[str, Any]:
        visible = await self._extract_visible_sessions()
        recent_sessions = [session for session in visible if int(session.get('session_type') or 0) == 1][:max_sessions]
        synced_sessions = 0
        synced_messages = 0

        for session in recent_sessions:
            result = await self.sync_chat_session(str(session.get('session_id') or ''), session_meta=session)
            synced_sessions += 1 if result.get('success') else 0
            synced_messages += int(result.get('messages_saved', 0) or 0)

        return {
            'success': True,
            'sessions_seen': len(recent_sessions),
            'sessions_synced': synced_sessions,
            'messages_saved': synced_messages,
        }

    async def sync_chat_session(self, chat_id: str, session_meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        target_chat_id = str(chat_id or '').strip()
        if not target_chat_id:
            return {'success': False, 'messages_saved': 0, 'error': '缺少 chat_id'}

        session_meta = session_meta or await self._find_and_select_session(target_chat_id)
        if not session_meta:
            return {'success': False, 'messages_saved': 0, 'error': f'未在本机聊天页找到会话 {target_chat_id}'}

        active_session_id = await self._get_active_session_id()
        if active_session_id != target_chat_id:
            clicked = await self._click_session(target_chat_id)
            if clicked:
                for _ in range(20):
                    await self.page.wait_for_timeout(150)
                    active_session_id = await self._get_active_session_id()
                    if active_session_id == target_chat_id:
                        break

        messages = await self._extract_thread_messages()
        counterparty_user_id, counterparty_name = _resolve_counterparty(self.cookie_id, session_meta)
        item_id = str(session_meta.get('item_id') or '')

        saved = 0
        for message in messages:
            if str(message.get('session_id') or '') != target_chat_id:
                continue

            created_at = _as_local_datetime_text(int(message.get('timestamp') or 0))
            content = _normalize_message_text(message)
            if not content:
                continue

            sender_user_id = str(message.get('sender_user_id') or '').strip()
            direction = str(message.get('direction') or '').strip()
            role = 'assistant' if direction == 'rtl' or sender_user_id == self.cookie_id else 'user'

            inserted_at = db_manager.save_conversation(
                cookie_id=self.cookie_id,
                chat_id=target_chat_id,
                user_id=counterparty_user_id or sender_user_id,
                user_name=counterparty_name,
                item_id=item_id,
                role=role,
                content=content,
                created_at=created_at,
            )
            if inserted_at:
                saved += 1

        return {
            'success': True,
            'chat_id': target_chat_id,
            'messages_seen': len(messages),
            'messages_saved': saved,
        }


async def _run_sync(cookie_id: str, chat_id: Optional[str], max_sessions: int) -> Dict[str, Any]:
    async with ConversationBrowserSync(cookie_id) as syncer:
        if chat_id:
            return await syncer.sync_chat_session(chat_id)
        return await syncer.sync_recent_sessions(max_sessions=max_sessions)


def sync_conversation_messages_best_effort(
    cookie_id: str,
    chat_id: Optional[str] = None,
    max_sessions: int = 6,
    cookie_cooldown_seconds: float = 12.0,
    chat_cooldown_seconds: float = 4.0,
) -> Dict[str, Any]:
    normalized_cookie_id = str(cookie_id or '').strip()
    normalized_chat_id = str(chat_id or '').strip()
    if not normalized_cookie_id:
        return {'success': False, 'error': '缺少 cookie_id'}

    now = time.time()
    if normalized_chat_id:
        last_chat_sync_at = _chat_sync_at.get((normalized_cookie_id, normalized_chat_id), 0)
        if now - last_chat_sync_at < chat_cooldown_seconds:
            return {'success': True, 'skipped': 'chat_cooldown'}
    else:
        last_recent_sync_at = _recent_sync_at.get(normalized_cookie_id, 0)
        if now - last_recent_sync_at < cookie_cooldown_seconds:
            return {'success': True, 'skipped': 'cookie_cooldown'}

    lock = _get_cookie_lock(normalized_cookie_id)
    if not lock.acquire(blocking=False):
        return {'success': True, 'skipped': 'sync_busy'}

    try:
        result = asyncio.run(
            asyncio.wait_for(
                _run_sync(
                    cookie_id=normalized_cookie_id,
                    chat_id=normalized_chat_id or None,
                    max_sessions=max_sessions,
                ),
                timeout=35,
            )
        )
        if normalized_chat_id:
            _chat_sync_at[(normalized_cookie_id, normalized_chat_id)] = time.time()
        else:
            _recent_sync_at[normalized_cookie_id] = time.time()
        return result
    except Exception as error:
        logger.warning(f"【{normalized_cookie_id}】聊天页同步失败: {error}")
        return {'success': False, 'error': str(error)}
    finally:
        lock.release()
