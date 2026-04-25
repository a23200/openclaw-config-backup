from __future__ import annotations

import hashlib
import json
import re
import subprocess
import time
import unicodedata
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
  const findVisible = (selector) => Array.from(document.querySelectorAll(selector)).find(visible) || null;
  const getAncestors = (node) => {
    const result = [];
    let current = node || null;
    while (current) {
      result.push(current);
      current = current.parentElement;
    }
    return result;
  };
  const findChatPanelRoot = (anchors) => {
    const usableAnchors = anchors.filter(Boolean);
    if (!usableAnchors.length) {
      return null;
    }
    for (const candidate of getAncestors(usableAnchors[0])) {
      if (!candidate || candidate === document.body || candidate === document.documentElement) {
        continue;
      }
      if (!visible(candidate) || !usableAnchors.every((node) => candidate.contains(node))) {
        continue;
      }
      const rect = candidate.getBoundingClientRect();
      if (rect.width < 240 || rect.height < 160) {
        continue;
      }
      return candidate;
    }
    return usableAnchors[0].parentElement || usableAnchors[0];
  };
  const collectTextElements = (root, { minTop = Number.NEGATIVE_INFINITY, maxBottom = Number.POSITIVE_INFINITY, exclude = [] } = {}) =>
    Array.from(root?.querySelectorAll('*') || [])
      .filter((node) => {
        if (!visible(node)) {
          return false;
        }
        if (exclude.some((blocked) => blocked && (blocked === node || blocked.contains(node)))) {
          return false;
        }
        const text = normalize(node.innerText || node.textContent);
        if (!text) {
          return false;
        }
        const rect = node.getBoundingClientRect();
        return rect.bottom >= minTop && rect.top <= maxBottom;
      })
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          node,
          text: normalize(node.innerText || node.textContent),
          rect,
          area: rect.width * rect.height,
        };
      });
  const collectTextNodes = (root, { minTop = Number.NEGATIVE_INFINITY, maxBottom = Number.POSITIVE_INFINITY, exclude = [] } = {}) => {
    if (!root) {
      return [];
    }
    const blocked = exclude.filter(Boolean);
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || !visible(parent)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (blocked.some((blockedNode) => blockedNode === parent || blockedNode.contains(parent))) {
            return NodeFilter.FILTER_REJECT;
          }
          return normalize(node.textContent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      }
    );
    const items = [];
    while (walker.nextNode()) {
      const textNode = walker.currentNode;
      const range = document.createRange();
      range.selectNodeContents(textNode);
      const rect = range.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        continue;
      }
      if (rect.bottom < minTop || rect.top > maxBottom) {
        continue;
      }
      items.push({
        text: normalize(textNode.textContent),
        rect,
        parent: textNode.parentElement,
      });
    }
    return items;
  };
  const isIgnoredHeaderText = (text) =>
    !text ||
    text.length > 40 ||
    [
      '私信',
      '关闭会话',
      '关注',
      '发送消息',
      '在线',
      '去设置',
      '设置',
    ].includes(text) ||
    text.startsWith('·') ||
    text.includes('发送消息') ||
    text.includes('对方回复或关注你之前') ||
    text.includes('只能发送') ||
    text.includes('暂时无法') ||
    /^(刚刚|\d+秒前|\d+分钟前|\d+小时前|\d+天前|\d{1,2}:\d{2}|\d{1,2}-\d{1,2})$/.test(text);
  const composer = findVisible('div[role="textbox"].public-DraftEditor-content');
  const sendButton = findVisible('.e2e-send-msg-btn');
  const bodyText = normalize(document.body.innerText);
  const panelRoot = findChatPanelRoot([composer, sendButton]);
  const panelRect = panelRoot?.getBoundingClientRect() || null;
  const composerRect = composer?.getBoundingClientRect() || sendButton?.getBoundingClientRect() || null;
  let currentChatName = '';
  let chatBodyText = '';
  if (panelRoot && panelRect) {
    const headerLimit = composerRect
      ? Math.min(composerRect.top - 12, panelRect.top + Math.min(Math.max(panelRect.height * 0.28, 80), 220))
      : panelRect.top + Math.min(Math.max(panelRect.height * 0.28, 80), 220);
    const headerCandidate = collectTextElements(panelRoot, {
      minTop: panelRect.top - 1,
      maxBottom: headerLimit,
      exclude: [composer, sendButton],
    })
      .filter((item) => !isIgnoredHeaderText(item.text))
      .sort((left, right) => {
        const leftScore =
          (left.rect.top - panelRect.top) * 6 +
          Math.abs(left.rect.left - panelRect.left) +
          left.text.length;
        const rightScore =
          (right.rect.top - panelRect.top) * 6 +
          Math.abs(right.rect.left - panelRect.left) +
          right.text.length;
        return leftScore - rightScore || left.area - right.area;
      })[0];
    currentChatName = headerCandidate?.text || '';
    const bodyStart = headerCandidate ? headerCandidate.rect.bottom + 4 : panelRect.top + 8;
    const bodyEnd = composerRect ? composerRect.top - 6 : panelRect.bottom - 6;
    if (bodyEnd > bodyStart) {
      chatBodyText = collectTextNodes(panelRoot, {
        minTop: bodyStart,
        maxBottom: bodyEnd,
        exclude: [composer, sendButton],
      })
        .filter((item) => !item.parent?.closest('button, [role="button"]'))
        .sort((left, right) => {
          if (left.rect.top !== right.rect.top) {
            return left.rect.top - right.rect.top;
          }
          return left.rect.left - right.rect.left;
        })
        .map((item) => item.text)
        .join('\n');
    }
  }
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
  const minTop = Math.max(72, window.innerHeight * 0.08);
  const candidates = Array.from(document.querySelectorAll('button, [role="button"], a'))
    .filter((node) => visible(node) && normalize(node.innerText || node.textContent) === '私信')
    .map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        node,
        rect,
        area: rect.width * rect.height,
      };
    })
    .sort((left, right) => {
      if (left.rect.top !== right.rect.top) {
        return right.rect.top - left.rect.top;
      }
      return right.area - left.area;
    });
  const button =
    candidates.find((item) => item.rect.top >= minTop)?.node ||
    candidates[0]?.node ||
    null;
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
  const normalizeName = (value) => {{
    const raw = String(value || '');
    const normalized = typeof raw.normalize === 'function' ? raw.normalize('NFKC') : raw;
    const compact = normalized.replace(/\\s+/g, '').toLowerCase();
    try {{
      return compact.replace(/[^\\p{{L}}\\p{{N}}]+/gu, '');
    }} catch (error) {{
      return compact.replace(/[^0-9a-zA-Z\\u4e00-\\u9fff]+/g, '');
    }}
  }};
  const namesMatch = (left, right) => {{
    const normalizedLeft = normalizeName(left);
    const normalizedRight = normalizeName(right);
    if (!normalizedLeft || !normalizedRight) {{
      return false;
    }}
    return normalizedLeft === normalizedRight || normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
  }};
  const visible = (node) => {{
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }};
  const findVisible = (selector) => Array.from(document.querySelectorAll(selector)).find(visible) || null;
  const getAncestors = (node) => {{
    const result = [];
    let current = node || null;
    while (current) {{
      result.push(current);
      current = current.parentElement;
    }}
    return result;
  }};
  const findChatPanelRoot = (anchors) => {{
    const usableAnchors = anchors.filter(Boolean);
    if (!usableAnchors.length) {{
      return null;
    }}
    for (const candidate of getAncestors(usableAnchors[0])) {{
      if (!candidate || candidate === document.body || candidate === document.documentElement) {{
        continue;
      }}
      if (!visible(candidate) || !usableAnchors.every((node) => candidate.contains(node))) {{
        continue;
      }}
      const rect = candidate.getBoundingClientRect();
      if (rect.width < 240 || rect.height < 160) {{
        continue;
      }}
      return candidate;
    }}
    return usableAnchors[0].parentElement || usableAnchors[0];
  }};
  const findOverlayRoot = (panelRoot) => {{
    if (!panelRoot) {{
      return null;
    }}
    const panelRect = panelRoot.getBoundingClientRect();
    let chosen = panelRoot;
    let current = panelRoot.parentElement;
    while (current && current !== document.body) {{
      if (visible(current)) {{
        const rect = current.getBoundingClientRect();
        const expandsLeft = rect.left <= panelRect.left - Math.max(panelRect.width * 0.04, 12);
        const fullyCoversPanel =
          rect.right >= panelRect.right - 4 &&
          rect.top <= panelRect.top + 8 &&
          rect.bottom >= panelRect.bottom - 8;
        if (expandsLeft && fullyCoversPanel) {{
          chosen = current;
        }}
      }}
      current = current.parentElement;
    }}
    return chosen;
  }};
  const findClickable = (node, stopAt) => {{
    let current = node;
    while (current && current !== stopAt && current !== document.body) {{
      if (!visible(current)) {{
        current = current.parentElement;
        continue;
      }}
      if (
        current.matches?.('button, a, li, [role="button"], [tabindex]') ||
        typeof current.onclick === 'function' ||
        window.getComputedStyle(current).cursor === 'pointer'
      ) {{
        return current;
      }}
      current = current.parentElement;
    }}
    return visible(node) ? node : null;
  }};
  const composer = findVisible('div[role="textbox"].public-DraftEditor-content');
  const sendButton = findVisible('.e2e-send-msg-btn');
  const panelRoot = findChatPanelRoot([composer, sendButton]);
  if (!panelRoot) {{
    return JSON.stringify({{ clicked: false, reason: 'panel_not_found' }});
  }}
  const panelRect = panelRoot.getBoundingClientRect();
  const overlayRoot = findOverlayRoot(panelRoot) || document.body;
  const deduped = new Map();
  for (const node of Array.from(overlayRoot.querySelectorAll('div, span, p, a, button'))) {{
    if (!visible(node) || panelRoot.contains(node)) {{
      continue;
    }}
    const text = normalize(node.innerText || node.textContent);
    if (!text || !namesMatch(text, targetName)) {{
      continue;
    }}
    const rect = node.getBoundingClientRect();
    if (rect.right > panelRect.left + Math.max(panelRect.width * 0.08, 24)) {{
      continue;
    }}
    const clickable = findClickable(node, overlayRoot) || node;
    const key = clickable;
    const candidate = {{
      text,
      area: rect.width * rect.height,
      clickable,
      clickableRect: clickable.getBoundingClientRect(),
      distance:
        Math.abs(rect.top + rect.height / 2 - (panelRect.top + panelRect.height / 2)) +
        Math.abs(panelRect.left - rect.right),
    }};
    const existing = deduped.get(key);
    if (!existing || candidate.area < existing.area || (candidate.area === existing.area && candidate.distance < existing.distance)) {{
      deduped.set(key, candidate);
    }}
  }}
  const chosen = Array.from(deduped.values()).sort((left, right) => {{
    if (left.area !== right.area) {{
      return left.area - right.area;
    }}
    return left.distance - right.distance;
  }})[0];
  if (!chosen) {{
    return JSON.stringify({{ clicked: false, reason: 'not_found' }});
  }}
  const rect = chosen.clickableRect;
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {{
    chosen.clickable.dispatchEvent(new MouseEvent(type, {{ bubbles: true, cancelable: true, clientX: x, clientY: y }}));
  }});
  chosen.clickable.click?.();
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


def _normalize_dm_name(value: str) -> str:
    text = unicodedata.normalize("NFKC", value or "").strip()
    return "".join(char.casefold() for char in text if unicodedata.category(char)[0] in {"L", "N"})


def _dm_names_match(current_name: str, target_name: str) -> bool:
    current = _normalize_dm_name(current_name)
    target = _normalize_dm_name(target_name)
    if not current or not target:
        return False
    if current == target:
        return True
    shorter, longer = sorted((current, target), key=len)
    return shorter in longer


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


def _read_dm_state_with_retry(*, auto_connect: bool, retries: int = 3, delay_seconds: float = 0.5) -> dict:
    last_error: DouyinCollectionError | None = None
    for attempt in range(retries):
        try:
            return _read_dm_state(auto_connect=auto_connect)
        except DouyinCollectionError as exc:
            last_error = exc
            if attempt == retries - 1:
                break
            time.sleep(delay_seconds)
    raise last_error or DouyinCollectionError("读取私信状态失败")


def _wait_for_dm_ready(*, auto_connect: bool, retries: int = 10, delay_seconds: float = 0.6) -> dict:
    last_state: dict = {}
    for attempt in range(retries):
        last_state = _read_dm_state_with_retry(auto_connect=auto_connect)
        if last_state.get("has_settings_prompt") or (
            last_state.get("has_input_box") and last_state.get("has_send_text")
        ):
            return last_state
        if attempt != retries - 1:
            time.sleep(delay_seconds)
    return last_state


def _count_message_occurrences(chat_body_text: str, message_text: str) -> int:
    if not chat_body_text or not message_text:
        return 0
    return len(re.findall(re.escape(message_text), chat_body_text))


def _dm_send_confirmed(
    state: dict,
    message_text: str,
    *,
    previous_chat_body_text: str | None = None,
) -> bool:
    composer_text = (state.get("composer_text") or "").strip()
    chat_body_text = state.get("chat_body_text") or ""
    if composer_text:
        return False
    if previous_chat_body_text is None:
        return message_text in chat_body_text

    previous_count = _count_message_occurrences(previous_chat_body_text, message_text)
    current_count = _count_message_occurrences(chat_body_text, message_text)
    if current_count > previous_count:
        return True
    return previous_count == 0 and current_count > 0 and chat_body_text != previous_chat_body_text


def _send_dm_message(
    *,
    auto_connect: bool,
    message_text: str,
    previous_chat_body_text: str | None = None,
) -> tuple[bool, dict]:
    state = _read_dm_state_with_retry(auto_connect=auto_connect)
    if _dm_send_confirmed(state, message_text, previous_chat_body_text=previous_chat_body_text):
        return True, state

    send_attempts: list[tuple[str, list[str] | None, str | None, float]] = [
        ("native_click", ["click", DM_SEND_BUTTON_SELECTOR], None, 0.8),
        ("press_enter", ["press", "Enter"], None, 0.5),
        ("press_return", ["press", "Return"], None, 0.5),
        ("eval_click", None, DM_SEND_BUTTON_SCRIPT, 0.8),
    ]

    for name, command, script, pause_seconds in send_attempts:
        try:
            if name.startswith("press"):
                with suppress(DouyinCollectionError):
                    _run_agent_browser(
                        ["click", DM_INPUT_SELECTOR],
                        auto_connect=auto_connect,
                        session_name=DOUYIN_DM_BROWSER_SESSION,
                        timeout_seconds=8,
                    )
                    time.sleep(0.1)
            if command:
                _run_agent_browser(
                    command,
                    auto_connect=auto_connect,
                    session_name=DOUYIN_DM_BROWSER_SESSION,
                    timeout_seconds=10,
                )
            else:
                send_result = _decode_eval_result(
                    _run_agent_browser(
                        ["eval", "--stdin"],
                        auto_connect=auto_connect,
                        session_name=DOUYIN_DM_BROWSER_SESSION,
                        stdin_text=script,
                        timeout_seconds=12,
                    )
                )
                if not send_result.get("clicked"):
                    continue
            time.sleep(pause_seconds)
        except DouyinCollectionError:
            continue

        state = _read_dm_state_with_retry(auto_connect=auto_connect)
        if _dm_send_confirmed(state, message_text, previous_chat_body_text=previous_chat_body_text):
            return True, state

    return False, state


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
            profile_name = (target_name or _run_agent_browser(
                ["get", "text", "h1"],
                auto_connect=auto_connect,
                session_name=DOUYIN_DM_BROWSER_SESSION,
                timeout_seconds=10,
            )).strip()

            post_snapshot = snapshot
            state: dict = {}
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
                time.sleep(0.8)
                state = _wait_for_dm_ready(auto_connect=auto_connect)
                post_snapshot = _run_agent_browser(
                    ["snapshot", "-i"],
                    auto_connect=auto_connect,
                    session_name=DOUYIN_DM_BROWSER_SESSION,
                    timeout_seconds=30,
                )
                if state.get("has_input_box") and state.get("has_send_text"):
                    break
            current_url = _run_agent_browser(
                ["get", "url"],
                auto_connect=auto_connect,
                session_name=DOUYIN_DM_BROWSER_SESSION,
            )

            has_input_box = bool(state.get("has_input_box") and state.get("has_send_text"))
            has_settings_prompt = bool(state.get("has_settings_prompt"))
            current_chat_name = (state.get("current_chat_name") or "").strip()
            selected = not profile_name or not current_chat_name or _dm_names_match(current_chat_name, profile_name)
            if has_input_box and profile_name and current_chat_name and not selected:
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
                state = _read_dm_state_with_retry(auto_connect=auto_connect)
                has_input_box = bool(state.get("has_input_box") and state.get("has_send_text"))
                has_settings_prompt = bool(state.get("has_settings_prompt"))
                current_chat_name = (state.get("current_chat_name") or "").strip()
                selected = not profile_name or not current_chat_name or _dm_names_match(current_chat_name, profile_name)
                if has_input_box and current_chat_name and not selected:
                    raise DouyinCollectionError(
                        f"私信窗口已打开，但会话切换后仍未命中目标：{profile_name}（当前：{current_chat_name}）"
                    )

            filled = False
            sent = False
            send_error_message = ""
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
                    try:
                        pre_send_state = _read_dm_state_with_retry(auto_connect=auto_connect)
                        sent, state = _send_dm_message(
                            auto_connect=auto_connect,
                            message_text=message_text,
                            previous_chat_body_text=(pre_send_state.get("chat_body_text") or ""),
                        )
                    except DouyinCollectionError as exc:
                        send_error_message = str(exc)
                        sent = False

            opened = (has_input_box and selected) or has_settings_prompt
            if sent:
                detail = f"已切到 {profile_name or '目标用户'} 私信窗口，并发送“{message_text}”"
            elif has_input_box and filled and send_message and send_error_message:
                detail = (
                    f"已切到 {profile_name or '目标用户'} 私信窗口，并填入“{message_text}”，"
                    f"但发送阶段页面发生刷新或状态读取失败（{send_error_message}），请在浏览器里手动点发送。"
                )
            elif has_input_box and filled and send_message:
                detail = (
                    f"已切到 {profile_name or '目标用户'} 私信窗口，并填入“{message_text}”，"
                    "但未确认发送成功，请在浏览器里手动点发送。"
                )
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
