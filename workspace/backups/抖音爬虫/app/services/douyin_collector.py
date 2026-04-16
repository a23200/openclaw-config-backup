from __future__ import annotations

import hashlib
import json
import re
import subprocess
import time
from contextlib import suppress
from datetime import datetime, timezone
from subprocess import TimeoutExpired
from urllib.parse import quote
from urllib import request

from app.schemas import CommentAuthorInput, CommentInput


DOUYIN_BROWSER_SESSION = "leadops-douyin"
DOUYIN_DM_BROWSER_SESSION = "leadops-douyin-dm"
DOUYIN_DISCOVERY_SESSION = "leadops-douyin-discovery"
DM_BUTTON_REF_RE = re.compile(r'button "私信" \[ref=(e\d+)\]')
TEXTBOX_REF_RE = re.compile(r'textbox(?: "[^"]*")? \[ref=(e\d+)\]')
DM_INPUT_SELECTOR = 'div[role="textbox"].public-DraftEditor-content'
DM_SEND_BUTTON_SELECTOR = ".e2e-send-msg-btn"
DEFAULT_DISCOVERY_KEYWORDS = ["副业", "创业", "兼职", "搞钱", "引流", "招商"]
DISCOVERY_SORT_LABELS = {
    "comprehensive": "综合排序",
    "latest": "最新发布",
    "most_liked": "最多点赞",
}
DISCOVERY_SORT_ALIASES = {
    "": "comprehensive",
    "综合排序": "comprehensive",
    "综合": "comprehensive",
    "comprehensive": "comprehensive",
    "latest": "latest",
    "最新发布": "latest",
    "most_liked": "most_liked",
    "最多点赞": "most_liked",
}
DISCOVERY_PUBLISH_TIME_LABELS = {
    "all": "不限",
    "day": "一天内",
    "week": "一周内",
    "half_year": "半年内",
}
DISCOVERY_PUBLISH_TIME_ALIASES = {
    "": "all",
    "all": "all",
    "不限": "all",
    "day": "day",
    "一天内": "day",
    "week": "week",
    "一周内": "week",
    "half_year": "half_year",
    "半年内": "half_year",
}
DISCOVERY_VIDEO_DURATION_LABELS = {
    "all": "不限",
    "lt_1m": "1分钟以下",
    "between_1m_5m": "1-5分钟",
    "gt_5m": "5分钟以上",
}
DISCOVERY_VIDEO_DURATION_ALIASES = {
    "": "all",
    "all": "all",
    "不限": "all",
    "lt_1m": "lt_1m",
    "1分钟以下": "lt_1m",
    "between_1m_5m": "between_1m_5m",
    "1-5分钟": "between_1m_5m",
    "gt_5m": "gt_5m",
    "5分钟以上": "gt_5m",
}
DISCOVERY_SEARCH_SCOPE_LABELS = {
    "all": "不限",
    "following": "关注的人",
    "recent": "最近看过",
    "unseen": "还未看过",
}
DISCOVERY_SEARCH_SCOPE_ALIASES = {
    "": "all",
    "all": "all",
    "不限": "all",
    "following": "following",
    "关注的人": "following",
    "recent": "recent",
    "最近看过": "recent",
    "unseen": "unseen",
    "还未看过": "unseen",
}

COMMENT_EXTRACTION_SCRIPT = r"""
(() => {
  const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
  const toUrl = (href) => {
    try {
      return new URL(href, location.href);
    } catch {
      return null;
    }
  };
  const makeAbsolute = (href) => toUrl(href)?.toString() || href || '';
  const canonicalProfileUrl = (href) => {
    const url = toUrl(href);
    if (!url) {
      return href || '';
    }
    url.search = '';
    url.hash = '';
    return url.toString();
  };
  const visible = (node) => {
    if (!node) return false;
    const style = window.getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const TIME_RE = /(刚刚|\d+秒前|\d+分钟前|\d+小时前|\d+天前|\d{1,2}-\d{1,2})/;
  const LIKE_RE = /^\d+(\.\d+)?[wW万]?$/;

  const findCommentSection = () => {
    const anchors = Array.from(document.querySelectorAll('[class*="comment-title"], span, div'))
      .filter((node) => normalize(node.textContent) === '全部评论');
    for (const anchor of anchors) {
      let current = anchor;
      for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
        if (visible(current) && current.querySelector('[data-e2e="comment-item"]')) {
          return current;
        }
      }
    }
    const commentRoot = Array.from(document.querySelectorAll('[data-e2e="comment-item"]')).find(visible);
    if (!commentRoot) {
      return null;
    }
    let current = commentRoot.parentElement;
    while (current) {
      if (visible(current) && current.querySelectorAll('[data-e2e="comment-item"]').length > 1) {
        return current;
      }
      current = current.parentElement;
    }
    return commentRoot.parentElement;
  };

  const getTimeText = (root) => {
    const texts = Array.from(root.querySelectorAll('span, div, p'))
      .map((node) => normalize(node.textContent))
      .filter(Boolean);
    return texts.find((text) => TIME_RE.test(text) && (text.includes('·') || text.length <= 18)) || '';
  };

  const getLikeText = (root) => {
    const stats = root.querySelector('[class*="comment-item-stats-container"]');
    if (!stats) return '';
    const texts = Array.from(stats.querySelectorAll('span, p, div'))
      .map((node) => normalize(node.textContent))
      .filter(Boolean);
    return texts.find((text) => LIKE_RE.test(text)) || '';
  };

  const stripTailMeta = (value) => {
    let text = normalize(value).replace(/^\.{2,}/, '').trim();
    const tailMatch = text.match(/(刚刚|\d+秒前|\d+分钟前|\d+小时前|\d+天前|\d{1,2}-\d{1,2})(?:·[^ ]+)?(?:\d+分享)?回复?(?:展开\d+条回复)?$/);
    if (tailMatch && typeof tailMatch.index === 'number' && tailMatch.index > 0) {
      text = text.slice(0, tailMatch.index).trim();
    }
    text = text.replace(/(?:\d+分享)?回复(?:展开\d+条回复)?$/, '').trim();
    text = text.replace(/展开\d+条回复$/, '').trim();
    return text;
  };

  const extractContent = (root, nickname, timeText) => {
    const infoWrap = root.querySelector('[class*="comment-item-info-wrap"]');
    const contentParts = [];

    if (infoWrap?.parentElement) {
      for (const child of Array.from(infoWrap.parentElement.children)) {
        if (child === infoWrap) continue;
        if (child.querySelector('[class*="comment-item-stats-container"]')) continue;
        const text = normalize(child.innerText || child.textContent);
        if (!text || text === timeText) continue;
        if (TIME_RE.test(text) && text.length <= 18) continue;
        contentParts.push(text);
      }
    }

    let content = normalize(contentParts.join(' '));
    if (!content) {
      const clone = root.cloneNode(true);
      clone.querySelectorAll(
        '[class*="comment-item-avatar"], [class*="comment-item-info-wrap"], [data-e2e="video-comment-more"], [class*="comment-item-stats-container"]'
      ).forEach((node) => node.remove());
      content = normalize(clone.innerText || clone.textContent);
    }

    if (nickname && content.startsWith(nickname)) {
      content = content.slice(nickname.length).replace(/^\.{2,}/, '').trim();
    }
    if (timeText && content.endsWith(timeText)) {
      content = content.slice(0, -timeText.length).trim();
    }
    return stripTailMeta(content);
  };

  const commentSection = findCommentSection();
  const pageTitle = [
    normalize(document.title),
    normalize(document.querySelector('meta[property="og:title"]')?.getAttribute('content')),
    normalize(document.querySelector('meta[name="description"]')?.getAttribute('content')),
    normalize(document.querySelector('h1')?.textContent),
  ].find(Boolean) || '';
  const candidateRoots = Array.from(
    (commentSection || document).querySelectorAll('[data-e2e="comment-item"]')
  )
    .filter(visible)
    .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top);

  const items = [];
  for (const root of candidateRoots) {
    const infoWrap = root.querySelector('[class*="comment-item-info-wrap"]');
    const userLink = infoWrap?.querySelector('a[href*="/user/"]') || root.querySelector('a[href*="/user/"]');
    if (!userLink) continue;
    const nickname = normalize(userLink.textContent) || normalize(userLink.getAttribute('aria-label')) || '未知用户';
    const profileUrl = canonicalProfileUrl(userLink.getAttribute('href'));
    const timeText = getTimeText(root);
    const likeText = getLikeText(root);
    const content = extractContent(root, nickname, timeText);
    if (!content) continue;
    const replyMatch = normalize(root.innerText).match(/展开(\d+)条回复/);
    items.push({
      nickname,
      profile_url: profileUrl,
      content,
      time_text: timeText,
      like_text: likeText,
      reply_count: replyMatch ? Number(replyMatch[1]) : 0,
      raw_text: normalize(root.innerText).slice(0, 500),
    });
  }

  return JSON.stringify({
    title: pageTitle,
    url: location.href,
    body_snippet: normalize((commentSection || document.body).innerText).slice(0, 800),
    items,
  });
})()
"""

COMMENT_SCROLL_SCRIPT = r"""
(() => {
  const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
  const visible = (node) => {
    if (!node) return false;
    const style = window.getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const findCommentSection = () => {
    const anchors = Array.from(document.querySelectorAll('[class*="comment-title"], span, div'))
      .filter((node) => normalize(node.textContent) === '全部评论');
    for (const anchor of anchors) {
      let current = anchor;
      for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
        if (visible(current) && current.querySelector('[data-e2e="comment-item"]')) {
          return current;
        }
      }
    }
    const commentRoot = Array.from(document.querySelectorAll('[data-e2e="comment-item"]')).find(visible);
    if (!commentRoot) {
      return null;
    }
    let current = commentRoot.parentElement;
    while (current) {
      if (visible(current) && current.querySelectorAll('[data-e2e="comment-item"]').length > 1) {
        return current;
      }
      current = current.parentElement;
    }
    return commentRoot.parentElement;
  };
  const findScrollContainer = () => {
    const anchor = findCommentSection();
    let current = anchor;
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current);
      const canScroll = current.scrollHeight > current.clientHeight + 20;
      const scrollsVertically = ['auto', 'scroll', 'overlay'].includes(style.overflowY);
      if (visible(current) && canScroll && (scrollsVertically || current.querySelector('[data-e2e="comment-item"]'))) {
        return current;
      }
      current = current.parentElement;
    }

    const candidates = Array.from(document.querySelectorAll('body *'))
      .filter((node) => {
        if (!visible(node) || node.scrollHeight <= node.clientHeight + 20) return false;
        const commentCount = node.querySelectorAll?.('[data-e2e="comment-item"]').length || 0;
        const text = normalize(node.textContent);
        return commentCount > 0 || text.includes('全部评论') || text.includes('留下你的精彩评论吧');
      })
      .sort((left, right) => {
        const leftCount = left.querySelectorAll?.('[data-e2e="comment-item"]').length || 0;
        const rightCount = right.querySelectorAll?.('[data-e2e="comment-item"]').length || 0;
        return rightCount - leftCount || (right.scrollHeight - right.clientHeight) - (left.scrollHeight - left.clientHeight);
      });

    return candidates[0] || document.scrollingElement || document.documentElement;
  };

  const target = findScrollContainer();
  if (!target) {
    return JSON.stringify({
      scrolled: false,
      reason: 'container_not_found',
      item_count: document.querySelectorAll('[data-e2e="comment-item"]').length,
    });
  }

  const beforeTop = target.scrollTop || 0;
  const beforeHeight = target.scrollHeight || 0;
  const clientHeight = target.clientHeight || window.innerHeight || 900;
  const delta = Math.max(720, Math.round(clientHeight * 0.92));
  target.scrollTop = Math.min(beforeTop + delta, Math.max(beforeHeight - clientHeight, 0));
  target.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: delta }));
  target.dispatchEvent(new Event('scroll', { bubbles: true }));
  window.dispatchEvent(new Event('scroll'));

  return JSON.stringify({
    scrolled: target.scrollTop !== beforeTop,
    before_top: beforeTop,
    after_top: target.scrollTop || 0,
    before_height: beforeHeight,
    after_height: target.scrollHeight || 0,
    client_height: clientHeight,
    at_bottom: (target.scrollTop || 0) + clientHeight >= (target.scrollHeight || 0) - 4,
    item_count: document.querySelectorAll('[data-e2e="comment-item"]').length,
  });
})()
"""

DM_STATE_SCRIPT = r"""
(() => {
  const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
  const visible = (node) => {
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const scanRegionText = (bounds) =>
    Array.from(document.querySelectorAll('*'))
      .filter(visible)
      .map((node) => ({
        text: normalize(node.innerText || node.textContent),
        rect: node.getBoundingClientRect(),
      }))
      .filter(
        (item) =>
          item.text &&
          item.rect.left >= bounds.left &&
          item.rect.right <= bounds.right &&
          item.rect.top >= bounds.top &&
          item.rect.bottom <= bounds.bottom
      )
      .map((item) => item.text);
  const composer = document.querySelector('div[role="textbox"].public-DraftEditor-content');
  const sendButton = document.querySelector('.e2e-send-msg-btn');
  const bodyText = normalize(document.body.innerText);
  const currentChatName = scanRegionText({ left: 1688, right: 1895, top: 60, bottom: 100 }).find(
    (text) =>
      !['私信', '关闭会话', '关注'].includes(text) &&
      !text.startsWith('·') &&
      text !== '在线' &&
      !text.includes('发送消息')
  ) || '';
  const chatBodyText = scanRegionText({ left: 1675, right: 2175, top: 108, bottom: 674 }).join('\n');
  return JSON.stringify({
    has_input_box: visible(composer),
    has_settings_prompt: bodyText.includes('去设置'),
    has_send_text: visible(sendButton),
    composer_text: normalize(composer?.innerText || composer?.textContent),
    current_chat_name: currentChatName,
    chat_body_text: chatBodyText.slice(0, 2000),
  });
})()
"""


DM_CLICK_BUTTON_SCRIPT = r"""
(() => {
  const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
  const visible = (node) => {
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width >= 0 && rect.height >= 0;
  };
  const button = Array.from(document.querySelectorAll('button')).find(
    (node) => visible(node) && normalize(node.innerText || node.textContent) === '私信'
  );
  if (!button) {
    return JSON.stringify({ clicked: false, reason: 'not_found' });
  }
  const rect = button.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {
    button.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  });
  button.click();
  return JSON.stringify({ clicked: true });
})()
"""


DM_SEND_BUTTON_SCRIPT = r"""
(() => {
  const button = document.querySelector('.e2e-send-msg-btn');
  if (!button) {
    return JSON.stringify({ clicked: false, reason: 'not_found' });
  }
  const rect = button.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {
    button.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  });
  button.click();
  return JSON.stringify({ clicked: true });
})()
"""


DM_CAPTCHA_CHECK_SCRIPT = r"""
(() => {
  return JSON.stringify({
    title: document.title || '',
    body: (document.body?.innerText || '').slice(0, 500),
  });
})()
"""


VIDEO_DISCOVERY_SCRIPT = r"""
(() => {
  const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
  const toAbsolute = (href) => {
    try {
      return new URL(href, location.href).toString();
    } catch {
      return href || '';
    }
  };
  const items = [];
  for (const anchor of Array.from(document.querySelectorAll('a[href*="/video/"]'))) {
    const href = anchor.getAttribute('href') || '';
    const absolute = toAbsolute(href);
    const match = absolute.match(/\/video\/(\d+)/);
    if (!match) continue;
    const text = normalize(anchor.innerText || anchor.textContent || anchor.getAttribute('title') || '');
    if (!text) continue;
    items.push({
      platform_video_id: match[1],
      video_url: `https://www.douyin.com/video/${match[1]}`,
      raw_url: absolute,
      title: text.slice(0, 220),
    });
  }
  const deduped = [];
  const seen = new Set();
  for (const item of items) {
    if (!item.platform_video_id || seen.has(item.platform_video_id)) continue;
    seen.add(item.platform_video_id);
    deduped.push(item);
  }
  return JSON.stringify({
    page_url: location.href,
    page_title: document.title || '',
    items: deduped,
  });
})()
"""


def _build_select_chat_script(target_name: str) -> str:
    target_name_literal = json.dumps(target_name, ensure_ascii=False)
    return f"""
(() => {{
  const targetName = {target_name_literal};
  const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
  const visible = (node) => {{
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }};
  const candidates = Array.from(document.querySelectorAll('*'))
    .filter(visible)
    .map((node) => ({{
      text: normalize(node.innerText || node.textContent),
      rect: node.getBoundingClientRect(),
    }}))
    .filter(
      (item) =>
        item.text.startsWith(targetName) &&
        item.text.includes('对方回复或关注你之前') &&
        item.rect.left >= 1420 &&
        item.rect.right <= 1675 &&
        item.rect.top >= 108 &&
        item.rect.bottom <= 756
    )
    .sort((left, right) => left.rect.width * left.rect.height - right.rect.width * right.rect.height);
  const chosen = candidates[0];
  if (!chosen) {{
    return JSON.stringify({{ clicked: false, reason: 'not_found' }});
  }}
  const x = chosen.rect.left + Math.min(40, chosen.rect.width / 2);
  const y = chosen.rect.top + Math.min(24, chosen.rect.height / 2);
  const target = document.elementFromPoint(x, y);
  if (!target) {{
    return JSON.stringify({{ clicked: false, reason: 'point_miss', x, y }});
  }}
  ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {{
    target.dispatchEvent(new MouseEvent(type, {{ bubbles: true, cancelable: true, clientX: x, clientY: y }}));
  }});
  return JSON.stringify({{
    clicked: true,
    target_text: chosen.text.slice(0, 120),
  }});
}})()
"""


class DouyinCollectionError(RuntimeError):
    pass


def extract_video_identifier(video_url: str) -> str:
    match = re.search(r"/video/(\d+)", video_url)
    if match:
        return match.group(1)
    return hashlib.sha1(video_url.encode("utf-8")).hexdigest()[:16]


def extract_user_identifier(profile_url: str) -> str:
    match = re.search(r"/user/([^/?#]+)", profile_url)
    if match:
        return match.group(1)
    return hashlib.sha1(profile_url.encode("utf-8")).hexdigest()[:16]


def resolve_video_url(video_url: str) -> str:
    try:
        with request.urlopen(video_url, timeout=15) as response:
            return response.geturl()
    except Exception:
        return video_url


def build_comment_identifier(video_id: str, profile_url: str, content: str) -> str:
    raw = f"{video_id}|{profile_url}|{content}".encode("utf-8")
    return f"dy_{hashlib.sha1(raw).hexdigest()[:20]}"


def parse_compact_count(value: str) -> int:
    text = (value or "").strip().lower()
    if not text:
        return 0
    multiplier = 1
    if text.endswith(("w", "万")):
        multiplier = 10_000
        text = text[:-1]
    try:
        return int(float(text) * multiplier)
    except ValueError:
        return 0


def _decode_eval_result(raw_output: str) -> dict:
    text = raw_output.strip()
    if not text:
        return {}
    try:
        first_pass = json.loads(text)
        if isinstance(first_pass, str):
            return json.loads(first_pass)
        if isinstance(first_pass, dict):
            return first_pass
    except json.JSONDecodeError as exc:
        raise DouyinCollectionError(f"无法解析浏览器返回内容: {text[:200]}") from exc
    raise DouyinCollectionError("浏览器返回了不可识别的数据")


def _run_agent_browser(
    command: list[str],
    *,
    auto_connect: bool,
    session_name: str = DOUYIN_BROWSER_SESSION,
    stdin_text: str | None = None,
    timeout_seconds: int = 45,
) -> str:
    def build_command() -> list[str]:
        full_command = ["agent-browser"]
        if auto_connect:
            full_command.append("--auto-connect")
        full_command.extend(["--session", session_name])
        full_command.extend(command)
        return full_command

    def run_once() -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            build_command(),
            input=stdin_text,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )

    try:
        completed = run_once()
    except TimeoutExpired as exc:
        command_preview = " ".join(command)
        raise DouyinCollectionError(f"浏览器操作超时：{command_preview}") from exc

    message = completed.stderr.strip() or completed.stdout.strip() or "未知错误"
    if completed.returncode != 0 and "Session with given id not found" in message:
        with suppress(Exception):
            subprocess.run(
                ["agent-browser", "--session", session_name, "close"],
                capture_output=True,
                text=True,
                timeout=8,
                check=False,
            )
        time.sleep(0.8)
        try:
            completed = run_once()
        except TimeoutExpired as exc:
            command_preview = " ".join(command)
            raise DouyinCollectionError(f"浏览器操作超时：{command_preview}") from exc
        message = completed.stderr.strip() or completed.stdout.strip() or "未知错误"

    if completed.returncode != 0:
        raise DouyinCollectionError(message)
    return completed.stdout.strip()


def _ensure_not_captcha(*, auto_connect: bool, session_name: str = DOUYIN_BROWSER_SESSION) -> tuple[str, str]:
    title = _run_agent_browser(["get", "title"], auto_connect=auto_connect, session_name=session_name)
    body_text = _run_agent_browser(["get", "text", "body"], auto_connect=auto_connect, session_name=session_name)
    if "验证码" in title or "验证码" in body_text[:500]:
        raise DouyinCollectionError("霸霸返回了验证码页，请先在本机浏览器完成验证/登录后重试。")
    return title, body_text


def _read_dm_state(*, auto_connect: bool) -> dict:
    return _decode_eval_result(
        _run_agent_browser(
            ["eval", "--stdin"],
            auto_connect=auto_connect,
            session_name=DOUYIN_DM_BROWSER_SESSION,
            stdin_text=DM_STATE_SCRIPT,
            timeout_seconds=20,
        )
    )


def _ensure_dm_not_captcha(*, auto_connect: bool) -> None:
    try:
        state = _decode_eval_result(
            _run_agent_browser(
                ["eval", "--stdin"],
                auto_connect=auto_connect,
                session_name=DOUYIN_DM_BROWSER_SESSION,
                stdin_text=DM_CAPTCHA_CHECK_SCRIPT,
                timeout_seconds=12,
            )
        )
    except DouyinCollectionError:
        return
    if "验证码" in state.get("title", "") or "验证码" in state.get("body", ""):
        raise DouyinCollectionError("霸霸返回了验证码页，请先在本机浏览器完成验证/登录后重试。")


def _navigate_dm_page(profile_url: str, *, auto_connect: bool) -> None:
    navigate_script = f"""
(() => {{
  window.location.href = {json.dumps(profile_url, ensure_ascii=False)};
  return JSON.stringify({{ navigating: true }});
}})()
"""
    try:
        _run_agent_browser(
            ["eval", "--stdin"],
            auto_connect=auto_connect,
            session_name=DOUYIN_DM_BROWSER_SESSION,
            stdin_text=navigate_script,
            timeout_seconds=12,
        )
    except DouyinCollectionError as exc:
        try:
            _run_agent_browser(
                ["open", profile_url],
                auto_connect=auto_connect,
                session_name=DOUYIN_DM_BROWSER_SESSION,
                timeout_seconds=15,
            )
        except DouyinCollectionError as open_exc:
            message = str(open_exc)
            if "Operation timed out" not in message and not message.startswith("浏览器操作超时：open "):
                raise open_exc from exc


def _navigate_browser_page(url: str, *, auto_connect: bool, session_name: str) -> None:
    navigate_script = f"""
(() => {{
  window.location.href = {json.dumps(url, ensure_ascii=False)};
  return JSON.stringify({{ navigating: true }});
}})()
"""
    try:
        _run_agent_browser(
            ["eval", "--stdin"],
            auto_connect=auto_connect,
            session_name=session_name,
            stdin_text=navigate_script,
            timeout_seconds=12,
        )
    except DouyinCollectionError:
        try:
            _run_agent_browser(
                ["open", url],
                auto_connect=auto_connect,
                session_name=session_name,
                timeout_seconds=15,
            )
        except DouyinCollectionError as exc:
            message = str(exc)
            if "Operation timed out" not in message and not message.startswith("浏览器操作超时：open "):
                raise


def _normalize_discovery_keywords(raw_keywords: list[str] | None, *, max_keywords: int) -> list[str]:
    merged = raw_keywords or DEFAULT_DISCOVERY_KEYWORDS
    normalized: list[str] = []
    seen: set[str] = set()
    for keyword in merged:
        value = re.sub(r"\s+", " ", (keyword or "").strip())
        if not value or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
        if len(normalized) >= max_keywords:
            break
    return normalized or DEFAULT_DISCOVERY_KEYWORDS[:max_keywords]


def _normalize_discovery_filter(value: str | None, aliases: dict[str, str], default: str) -> str:
    key = re.sub(r"\s+", " ", (value or "").strip())
    return aliases.get(key, default)


def normalize_discovery_sort(value: str | None) -> str:
    return _normalize_discovery_filter(value, DISCOVERY_SORT_ALIASES, "comprehensive")


def normalize_discovery_publish_time(value: str | None) -> str:
    return _normalize_discovery_filter(value, DISCOVERY_PUBLISH_TIME_ALIASES, "all")


def normalize_discovery_video_duration(value: str | None) -> str:
    return _normalize_discovery_filter(value, DISCOVERY_VIDEO_DURATION_ALIASES, "all")


def normalize_discovery_search_scope(value: str | None) -> str:
    return _normalize_discovery_filter(value, DISCOVERY_SEARCH_SCOPE_ALIASES, "all")


def _discovery_filter_labels(
    *,
    sort_by: str,
    publish_time: str,
    video_duration: str,
    search_scope: str,
) -> dict[str, str]:
    normalized_sort_by = normalize_discovery_sort(sort_by)
    normalized_publish_time = normalize_discovery_publish_time(publish_time)
    normalized_video_duration = normalize_discovery_video_duration(video_duration)
    normalized_search_scope = normalize_discovery_search_scope(search_scope)
    return {
        "排序依据": DISCOVERY_SORT_LABELS[normalized_sort_by],
        "发布时间": DISCOVERY_PUBLISH_TIME_LABELS[normalized_publish_time],
        "视频时长": DISCOVERY_VIDEO_DURATION_LABELS[normalized_video_duration],
        "搜索范围": DISCOVERY_SEARCH_SCOPE_LABELS[normalized_search_scope],
    }


def _build_discovery_filter_script(
    *,
    sort_by: str,
    publish_time: str,
    video_duration: str,
    search_scope: str,
) -> str:
    filter_labels = _discovery_filter_labels(
        sort_by=sort_by,
        publish_time=publish_time,
        video_duration=video_duration,
        search_scope=search_scope,
    )
    filter_labels_literal = json.dumps(filter_labels, ensure_ascii=False)
    return f"""
(() => {{
  const config = {filter_labels_literal};
  const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
  const visible = (node) => {{
    if (!node) return false;
    const style = window.getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }};
  const clickable = (node) => {{
    if (!node) return null;
    let current = node;
    while (current && current !== document.body) {{
      const style = window.getComputedStyle(current);
      const isInteractive =
        current.tagName === 'BUTTON' ||
        current.tagName === 'A' ||
        current.getAttribute('role') === 'button' ||
        current.tabIndex >= 0 ||
        style.cursor === 'pointer' ||
        current.getAttribute('onclick') !== null;
      if (typeof current.click === 'function' && isInteractive) {{
        return current;
      }}
      current = current.parentElement;
    }}
    return node;
  }};
  const clickNode = (node) => {{
    const target = clickable(node);
    if (!target) return false;
    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const pointTarget = document.elementFromPoint(x, y) || target;
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {{
      pointTarget.dispatchEvent(new MouseEvent(type, {{ bubbles: true, cancelable: true, clientX: x, clientY: y }}));
    }});
    pointTarget.click();
    return true;
  }};
  const areaOf = (node) => {{
    const rect = node.getBoundingClientRect();
    return rect.width * rect.height;
  }};
  const findByText = (root, text) =>
    Array.from(root.querySelectorAll('*'))
      .filter((node) => visible(node) && normalize(node.innerText || node.textContent) === text)
      .sort((left, right) => areaOf(left) - areaOf(right))[0];

  const applied = [];
  for (const [sectionTitle, optionText] of Object.entries(config)) {{
    const titleNode = findByText(document, sectionTitle);
    if (!titleNode) {{
      applied.push({{ section: sectionTitle, option: optionText, ok: false, reason: 'panel_not_open' }});
      continue;
    }}
    let sectionRoot = titleNode.parentElement;
    while (sectionRoot && sectionRoot !== document.body) {{
      const text = normalize(sectionRoot.innerText || sectionRoot.textContent);
      if (text.includes(sectionTitle) && text.includes(optionText)) {{
        break;
      }}
      sectionRoot = sectionRoot.parentElement;
    }}
    const optionNode =
      findByText(sectionRoot || document, optionText) ||
      findByText(document, optionText);
    if (!optionNode || !clickNode(optionNode)) {{
      applied.push({{ section: sectionTitle, option: optionText, ok: false, reason: 'option_not_found' }});
      continue;
    }}
    applied.push({{ section: sectionTitle, option: optionText, ok: true }});
  }}

  return JSON.stringify({{
    applied,
  }});
}})()
"""


DISCOVERY_FILTER_PANEL_SCRIPT = r"""
(() => {
  const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
  const visible = (node) => {
    if (!node) return false;
    const style = window.getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const hasPanel = () =>
    document.body.innerText.includes('排序依据') &&
    document.body.innerText.includes('发布时间') &&
    document.body.innerText.includes('视频时长') &&
    document.body.innerText.includes('搜索范围');
  if (hasPanel()) {
    return JSON.stringify({ opened: true, reason: 'already_open' });
  }
  const areaOf = (node) => {
    const rect = node.getBoundingClientRect();
    return rect.width * rect.height;
  };
  const buttons = Array.from(document.querySelectorAll('*'))
    .filter((node) => visible(node) && normalize(node.innerText || node.textContent) === '筛选')
    .sort((left, right) => areaOf(left) - areaOf(right));
  for (const button of buttons) {
    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    ['pointerover', 'mouseover', 'mouseenter', 'pointerenter'].forEach((type) => {
      button.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    });
    return JSON.stringify({ opened: true, reason: 'hovered_filter_button' });
  }
  return JSON.stringify({ opened: false, reason: 'filter_button_not_found' });
})()
"""


def _apply_discovery_filters(
    *,
    sort_by: str,
    publish_time: str,
    video_duration: str,
    search_scope: str,
    auto_connect: bool,
) -> dict:
    panel_probe = _decode_eval_result(
        _run_agent_browser(
            ["eval", "JSON.stringify({open: document.body.innerText.includes('排序依据') && document.body.innerText.includes('发布时间') && document.body.innerText.includes('视频时长') && document.body.innerText.includes('搜索范围')})"],
            auto_connect=auto_connect,
            session_name=DOUYIN_DISCOVERY_SESSION,
            timeout_seconds=10,
        )
    )
    if not panel_probe.get("open"):
        panel_state = _decode_eval_result(
            _run_agent_browser(
                ["eval", "--stdin"],
                auto_connect=auto_connect,
                session_name=DOUYIN_DISCOVERY_SESSION,
                stdin_text=DISCOVERY_FILTER_PANEL_SCRIPT,
                timeout_seconds=15,
            )
        )
        if not panel_state.get("opened"):
            raise DouyinCollectionError(f"霸霸搜索筛选面板打开失败：{json.dumps(panel_state, ensure_ascii=False)}")
        _run_agent_browser(
            ["wait", "1200"],
            auto_connect=auto_connect,
            session_name=DOUYIN_DISCOVERY_SESSION,
            timeout_seconds=4,
        )
    result = _decode_eval_result(
        _run_agent_browser(
            ["eval", "--stdin"],
            auto_connect=auto_connect,
            session_name=DOUYIN_DISCOVERY_SESSION,
            stdin_text=_build_discovery_filter_script(
                sort_by=sort_by,
                publish_time=publish_time,
                video_duration=video_duration,
                search_scope=search_scope,
            ),
            timeout_seconds=20,
        )
    )
    applied = result.get("applied", [])
    failed = [item for item in applied if not item.get("ok")]
    if failed:
        raise DouyinCollectionError(f"霸霸搜索筛选设置失败：{json.dumps(failed or result, ensure_ascii=False)}")
    _run_agent_browser(
        ["wait", "2500"],
        auto_connect=auto_connect,
        session_name=DOUYIN_DISCOVERY_SESSION,
        timeout_seconds=6,
    )
    return result


def open_profile_dm(
    profile_url: str,
    *,
    auto_connect: bool,
    target_name: str | None = None,
    message_text: str = "您好",
    send_message: bool = True,
) -> dict:
    last_error: DouyinCollectionError | None = None
    for attempt in range(2):
        try:
            _navigate_dm_page(profile_url, auto_connect=auto_connect)
            time.sleep(3)
            _ensure_dm_not_captcha(auto_connect=auto_connect)

            snapshot = _run_agent_browser(
                ["snapshot", "-i"],
                auto_connect=auto_connect,
                session_name=DOUYIN_DM_BROWSER_SESSION,
                timeout_seconds=30,
            )
            match = DM_BUTTON_REF_RE.search(snapshot)
            if not match:
                raise DouyinCollectionError("未找到资料页私信按钮，请确认该账号允许私信且页面已加载完成。")
            before_textboxes = set(TEXTBOX_REF_RE.findall(snapshot))
            profile_name = (target_name or _run_agent_browser(
                ["get", "text", "h1"],
                auto_connect=auto_connect,
                session_name=DOUYIN_DM_BROWSER_SESSION,
                timeout_seconds=10,
            )).strip()

            post_snapshot = snapshot
            state: dict = {}
            dm_input_ref = None
            for click_attempt in range(3):
                click_result = _decode_eval_result(
                    _run_agent_browser(
                        ["eval", "--stdin"],
                        auto_connect=auto_connect,
                        session_name=DOUYIN_DM_BROWSER_SESSION,
                        stdin_text=DM_CLICK_BUTTON_SCRIPT,
                        timeout_seconds=20,
                    )
                )
                if not click_result.get("clicked"):
                    raise DouyinCollectionError("未找到资料页私信按钮，请确认该账号允许私信且页面已加载完成。")
                post_snapshot = _run_agent_browser(
                    ["snapshot", "-i"],
                    auto_connect=auto_connect,
                    session_name=DOUYIN_DM_BROWSER_SESSION,
                    timeout_seconds=30,
                )
                time.sleep(1.2)
                post_snapshot = _run_agent_browser(
                    ["snapshot", "-i"],
                    auto_connect=auto_connect,
                    session_name=DOUYIN_DM_BROWSER_SESSION,
                    timeout_seconds=30,
                )
                state = _read_dm_state(auto_connect=auto_connect)
                after_textboxes = set(TEXTBOX_REF_RE.findall(post_snapshot))
                dm_input_ref = next(iter(after_textboxes - before_textboxes), None)
                if dm_input_ref and state.get("has_input_box") and state.get("has_send_text"):
                    break
            current_url = _run_agent_browser(
                ["get", "url"],
                auto_connect=auto_connect,
                session_name=DOUYIN_DM_BROWSER_SESSION,
            )

            has_input_box = bool(dm_input_ref and state.get("has_input_box") and state.get("has_send_text"))
            has_settings_prompt = bool(state.get("has_settings_prompt"))
            current_chat_name = (state.get("current_chat_name") or "").strip()
            selected = not profile_name or current_chat_name.startswith(profile_name)
            if has_input_box and profile_name and not selected:
                selection_result = _decode_eval_result(
                    _run_agent_browser(
                        ["eval", "--stdin"],
                        auto_connect=auto_connect,
                        session_name=DOUYIN_DM_BROWSER_SESSION,
                        stdin_text=_build_select_chat_script(profile_name),
                        timeout_seconds=20,
                    )
                )
                if not selection_result.get("clicked"):
                    raise DouyinCollectionError(f"私信窗口已打开，但未找到目标会话：{profile_name}")
                time.sleep(0.8)
                state = _read_dm_state(auto_connect=auto_connect)
                selected = True

            filled = False
            sent = False
            if has_input_box and selected:
                current_draft = _run_agent_browser(
                    ["get", "text", DM_INPUT_SELECTOR],
                    auto_connect=auto_connect,
                    session_name=DOUYIN_DM_BROWSER_SESSION,
                    timeout_seconds=10,
                ).strip()
                if current_draft != message_text:
                    _run_agent_browser(
                        ["click", DM_INPUT_SELECTOR],
                        auto_connect=auto_connect,
                        session_name=DOUYIN_DM_BROWSER_SESSION,
                        timeout_seconds=10,
                    )
                    if current_draft:
                        for shortcut in ("Meta+a", "Control+a"):
                            with suppress(DouyinCollectionError):
                                _run_agent_browser(
                                    ["press", shortcut],
                                    auto_connect=auto_connect,
                                    session_name=DOUYIN_DM_BROWSER_SESSION,
                                    timeout_seconds=8,
                                )
                                break
                        with suppress(DouyinCollectionError):
                            _run_agent_browser(
                                ["press", "Backspace"],
                                auto_connect=auto_connect,
                                session_name=DOUYIN_DM_BROWSER_SESSION,
                                timeout_seconds=8,
                            )
                        time.sleep(0.2)
                    _run_agent_browser(
                        ["keyboard", "inserttext", message_text],
                        auto_connect=auto_connect,
                        session_name=DOUYIN_DM_BROWSER_SESSION,
                        timeout_seconds=15,
                    )
                    time.sleep(0.3)
                filled = (
                    _run_agent_browser(
                        ["get", "text", DM_INPUT_SELECTOR],
                        auto_connect=auto_connect,
                        session_name=DOUYIN_DM_BROWSER_SESSION,
                        timeout_seconds=10,
                    ).strip()
                    == message_text
                )
                if filled and send_message:
                    send_result = _decode_eval_result(
                        _run_agent_browser(
                            ["eval", "--stdin"],
                            auto_connect=auto_connect,
                            session_name=DOUYIN_DM_BROWSER_SESSION,
                            stdin_text=DM_SEND_BUTTON_SCRIPT,
                            timeout_seconds=12,
                        )
                    )
                    if not send_result.get("clicked"):
                        raise DouyinCollectionError("已写入私信内容，但未找到发送按钮。")
                    time.sleep(0.8)
                    state = _read_dm_state(auto_connect=auto_connect)
                    sent = not (state.get("composer_text") or "").strip() and message_text in (state.get("chat_body_text") or "")

            opened = (has_input_box and selected) or has_settings_prompt
            if sent:
                detail = f"已切到 {profile_name or '目标用户'} 私信窗口，并发送“{message_text}”"
            elif has_input_box and filled:
                detail = f"已切到 {profile_name or '目标用户'} 私信窗口，并填入“{message_text}”"
            elif has_input_box:
                detail = f"已打开 {profile_name or '目标用户'} 私信窗口，但未能写入“{message_text}”"
            elif has_settings_prompt:
                detail = "已弹出私信相关面板；若未见输入框，请先在霸霸完成私信权限设置"
            else:
                detail = "已尝试点击私信，请检查浏览器中的聊天窗口是否已弹出"
            return {
                "opened": opened,
                "filled": filled,
                "sent": sent,
                "target_name": profile_name or target_name or "",
                "profile_url": profile_url,
                "current_url": current_url or profile_url,
                "detail": detail,
            }
        except DouyinCollectionError as exc:
            last_error = exc
            time.sleep(1)
            if attempt == 1:
                break

    raise last_error or DouyinCollectionError("打开私信窗口失败")


def discover_videos_by_keywords(
    keywords: list[str] | None,
    *,
    max_keywords: int,
    max_videos_per_keyword: int,
    sort_by: str,
    publish_time: str,
    video_duration: str,
    search_scope: str,
    auto_connect: bool,
) -> dict:
    active_keywords = _normalize_discovery_keywords(keywords, max_keywords=max_keywords)
    normalized_sort_by = normalize_discovery_sort(sort_by)
    normalized_publish_time = normalize_discovery_publish_time(publish_time)
    normalized_video_duration = normalize_discovery_video_duration(video_duration)
    normalized_search_scope = normalize_discovery_search_scope(search_scope)
    discovered: list[dict] = []
    seen_video_ids: set[str] = set()

    for keyword in active_keywords:
        search_url = f"https://www.douyin.com/search/{quote(keyword)}?type=video"
        _navigate_browser_page(
            search_url,
            auto_connect=auto_connect,
            session_name=DOUYIN_DISCOVERY_SESSION,
        )
        time.sleep(4)
        _apply_discovery_filters(
            sort_by=normalized_sort_by,
            publish_time=normalized_publish_time,
            video_duration=normalized_video_duration,
            search_scope=normalized_search_scope,
            auto_connect=auto_connect,
        )
        with suppress(DouyinCollectionError):
            _run_agent_browser(
                ["scroll", "down", "900"],
                auto_connect=auto_connect,
                session_name=DOUYIN_DISCOVERY_SESSION,
                timeout_seconds=8,
            )
        snapshot = _decode_eval_result(
            _run_agent_browser(
                ["eval", "--stdin"],
                auto_connect=auto_connect,
                session_name=DOUYIN_DISCOVERY_SESSION,
                stdin_text=VIDEO_DISCOVERY_SCRIPT,
                timeout_seconds=20,
            )
        )
        if "验证码" in snapshot.get("page_title", ""):
            raise DouyinCollectionError("霸霸搜索页返回了验证码，请先在本机浏览器完成验证后重试。")

        keyword_count = 0
        for item in snapshot.get("items", []):
            platform_video_id = item.get("platform_video_id") or ""
            if not platform_video_id or platform_video_id in seen_video_ids:
                continue
            seen_video_ids.add(platform_video_id)
            discovered.append(
                {
                    "keyword": keyword,
                    "platform_video_id": platform_video_id,
                    "video_url": item.get("video_url") or "",
                    "title": item.get("title") or "",
                }
            )
            keyword_count += 1
            if keyword_count >= max_videos_per_keyword:
                break

    return {
        "keywords": active_keywords,
        "sort_by": normalized_sort_by,
        "publish_time": normalized_publish_time,
        "video_duration": normalized_video_duration,
        "search_scope": normalized_search_scope,
        "videos": discovered,
    }


def collect_video_comments(
    video_url: str,
    *,
    max_scrolls: int,
    max_comments: int,
    auto_connect: bool,
) -> dict:
    resolved_video_url = resolve_video_url(video_url)
    _navigate_browser_page(
        resolved_video_url,
        auto_connect=auto_connect,
        session_name=DOUYIN_BROWSER_SESSION,
    )
    _run_agent_browser(["wait", "4000"], auto_connect=auto_connect, timeout_seconds=10)
    with suppress(DouyinCollectionError):
        _run_agent_browser(
            [
                "wait",
                "--fn",
                "document.body && (document.body.innerText.includes('全部评论') || document.body.innerText.includes('留下你的精彩评论吧') || document.body.innerText.includes('评论'))",
            ],
            auto_connect=auto_connect,
            timeout_seconds=15,
        )

    title, body_text = _ensure_not_captcha(auto_connect=auto_connect)

    merged: dict[str, dict] = {}
    last_snapshot: dict = {}
    current_url = _run_agent_browser(["get", "url"], auto_connect=auto_connect)
    video_id = extract_video_identifier(current_url or resolved_video_url)
    stable_rounds = 0
    previous_round_count = -1
    last_scroll_state: dict = {}

    for round_index in range(max_scrolls + 1):
        snapshot_raw = _run_agent_browser(
            ["eval", "--stdin"],
            auto_connect=auto_connect,
            stdin_text=COMMENT_EXTRACTION_SCRIPT,
            timeout_seconds=30,
        )
        snapshot = _decode_eval_result(snapshot_raw)
        last_snapshot = snapshot

        if "验证码" in snapshot.get("title", "") or "验证码" in snapshot.get("body_snippet", ""):
            raise DouyinCollectionError("霸霸返回了验证码页，请先在本机浏览器完成验证/登录后重试。")

        for item in snapshot.get("items", []):
            profile_url = item.get("profile_url") or ""
            content = item.get("content") or ""
            if not profile_url or not content or "/user/self" in profile_url:
                continue
            comment_id = build_comment_identifier(video_id, profile_url, content)
            merged[comment_id] = {
                "platform_comment_id": comment_id,
                "content": content,
                "like_count": parse_compact_count(item.get("like_text", "")),
                "reply_count": item.get("reply_count", 0),
                "comment_time": datetime.now(timezone.utc).isoformat(),
                "author": {
                    "platform_user_id": extract_user_identifier(profile_url),
                    "nickname": item.get("nickname") or "未知用户",
                    "profile_url": profile_url,
                    "bio": None,
                    "province": None,
                    "city": None,
                    "follower_count": 0,
                    "following_count": 0,
                    "liked_count": 0,
                    },
                }

        if len(merged) == previous_round_count:
            stable_rounds += 1
        else:
            stable_rounds = 0
        previous_round_count = len(merged)

        if len(merged) >= max_comments:
            break
        if round_index >= max_scrolls:
            break
        if stable_rounds >= 2 and last_scroll_state.get("at_bottom"):
            break

        try:
            last_scroll_state = _decode_eval_result(
                _run_agent_browser(
                    ["eval", "--stdin"],
                    auto_connect=auto_connect,
                    stdin_text=COMMENT_SCROLL_SCRIPT,
                    timeout_seconds=20,
                )
            )
        except DouyinCollectionError:
            last_scroll_state = {}
            with suppress(DouyinCollectionError):
                _run_agent_browser(["scroll", "down", "1400"], auto_connect=auto_connect, timeout_seconds=15)
        _run_agent_browser(["wait", "1500"], auto_connect=auto_connect, timeout_seconds=15)

    comments = list(merged.values())[:max_comments]
    return {
        "page_title": last_snapshot.get("title") or title,
        "page_url": last_snapshot.get("url") or current_url or resolved_video_url,
        "body_snippet": last_snapshot.get("body_snippet") or body_text[:300],
        "comments": comments,
    }


def normalize_comments_for_ingestion(collected_comments: list[dict]) -> list[CommentInput]:
    normalized: list[CommentInput] = []
    for item in collected_comments:
        normalized.append(
            CommentInput(
                platform_comment_id=item["platform_comment_id"],
                content=item["content"],
                like_count=item.get("like_count", 0),
                reply_count=item.get("reply_count", 0),
                comment_time=item["comment_time"],
                author=CommentAuthorInput(**item["author"]),
            )
        )
    return normalized
