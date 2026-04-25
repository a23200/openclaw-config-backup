function clampPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeSpace(input) {
  return String(input || "").replace(/\s+/g, " ").trim();
}

function truncateText(input, maxChars) {
  const text = String(input || "");
  if (text.length <= maxChars) return text;
  if (maxChars <= 1) return text.slice(0, maxChars);
  return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

function trimForPrompt(input, maxLength = 18_000) {
  const text = String(input || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n\n[内容过长，已自动截断以适配生成接口]`;
}

function estimateUtf8Bytes(input) {
  return Buffer.byteLength(String(input || ""), "utf8");
}

function looksLikeMarkdownDivider(line) {
  return /^(-{3,}|\*{3,}|_{3,}|[:|\-\s]+)$/.test(line) || /^\|?[\s:-]+\|[\s|:-]*$/.test(line);
}

function cleanMarkdownText(input) {
  let text = String(input || "");
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  text = text.replace(/`{1,3}([^`]+)`{1,3}/g, "$1");
  text = text.replace(/[*_~]+/g, "");
  text = text.replace(/^>\s+/, "");
  text = text.replace(/^\|+/, "").replace(/\|+$/, "");
  text = text.replace(/\s*\|\s*/g, " | ");
  return normalizeSpace(text);
}

function parseMarkdownSections(markdownText, options = {}) {
  const maxLineChars = clampPositiveInt(options.maxLineChars, 180);
  const lines = String(markdownText || "").split(/\r?\n/);
  const sections = [];
  let current = { title: "", items: [] };
  let inCodeBlock = false;

  function pushCurrent() {
    if (!current.title && !current.items.length) return;
    sections.push({
      title: current.title,
      items: [...current.items],
    });
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    if (/^```/.test(trimmed)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock || looksLikeMarkdownDivider(trimmed)) continue;

    if (/^#{1,6}\s+/.test(trimmed)) {
      pushCurrent();
      current = {
        title: truncateText(cleanMarkdownText(trimmed.replace(/^#{1,6}\s+/, "")), maxLineChars),
        items: [],
      };
      continue;
    }

    let normalized = "";
    if (/^[-*+]\s+/.test(trimmed)) {
      normalized = `- ${truncateText(cleanMarkdownText(trimmed.replace(/^[-*+]\s+/, "")), maxLineChars)}`;
    } else if (/^\d+[.)]\s+/.test(trimmed)) {
      normalized = `- ${truncateText(cleanMarkdownText(trimmed.replace(/^\d+[.)]\s+/, "")), maxLineChars)}`;
    } else if (/^\|/.test(trimmed) && trimmed.includes("|")) {
      normalized = `- 表格：${truncateText(cleanMarkdownText(trimmed), maxLineChars)}`;
    } else {
      normalized = truncateText(cleanMarkdownText(trimmed), maxLineChars);
    }

    if (!normalized) continue;
    if (current.items[current.items.length - 1] === normalized) continue;
    current.items.push(normalized);
  }

  pushCurrent();
  return sections;
}

function scoreSectionItem(item, index) {
  let score = Math.max(0, 10 - index * 0.25);
  if (/\d/.test(item)) score += 5;
  if (/[年月日%]/.test(item)) score += 2;
  if (/[：:]/.test(item)) score += 1;
  if (item.length >= 16 && item.length <= 120) score += 1;
  return score;
}

function pickSectionItems(items, maxItems) {
  const uniqueItems = [];
  const seen = new Set();
  for (const item of items) {
    const key = normalizeSpace(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueItems.push(item.startsWith("- ") ? item : `- ${item}`);
  }
  if (uniqueItems.length <= maxItems) return uniqueItems;

  const [firstItem, ...rest] = uniqueItems;
  const ranked = rest
    .map((item, index) => ({ item, score: scoreSectionItem(item, index) }))
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.item);

  return [firstItem, ...ranked].slice(0, maxItems);
}

function buildCompactSourceDigest(markdownText, options = {}) {
  const maxChars = clampPositiveInt(options.maxChars, 12_000);
  const maxSections = clampPositiveInt(options.maxSections, 12);
  const maxItemsPerSection = clampPositiveInt(options.maxItemsPerSection, 4);
  const sections = parseMarkdownSections(markdownText, options);
  const lines = ["以下为自动压缩摘要，保留标题、要点、数字与时间："];
  let currentLength = lines[0].length;
  const seenLines = new Set([lines[0]]);

  function tryAppend(line) {
    const normalized = String(line || "").trim();
    if (!normalized || seenLines.has(normalized)) return true;
    const nextLength = currentLength + 1 + normalized.length;
    if (nextLength > maxChars) return false;
    lines.push(normalized);
    seenLines.add(normalized);
    currentLength = nextLength;
    return true;
  }

  for (const section of sections.slice(0, maxSections)) {
    const blockLines = [];
    if (section.title) {
      blockLines.push(`## ${section.title}`);
    }
    blockLines.push(...pickSectionItems(section.items, maxItemsPerSection));
    if (!blockLines.length) continue;
    for (const line of blockLines) {
      if (!tryAppend(line)) {
        return truncateText(lines.join("\n"), maxChars);
      }
    }
  }

  if (lines.length > 1) {
    return truncateText(lines.join("\n"), maxChars);
  }

  return truncateText(cleanMarkdownText(markdownText), maxChars);
}

function buildPromptSource(markdownText, options = {}) {
  const rawText = String(markdownText || "").trim();
  const maxChars = clampPositiveInt(options.maxChars, 12_000);
  const preferFullChars = clampPositiveInt(options.preferFullChars, Math.min(maxChars, 6_000));
  const trimmed = trimForPrompt(rawText, maxChars);

  if (trimmed.length <= preferFullChars) {
    return {
      text: trimmed,
      mode: trimmed.length < rawText.length ? "trimmed" : "full",
      bytes: estimateUtf8Bytes(trimmed),
    };
  }

  const digest = buildCompactSourceDigest(rawText, options);
  if (!digest || digest.length >= trimmed.length * 0.95) {
    return {
      text: trimmed,
      mode: trimmed.length < rawText.length ? "trimmed" : "full",
      bytes: estimateUtf8Bytes(trimmed),
    };
  }

  return {
    text: digest,
    mode: "digest",
    bytes: estimateUtf8Bytes(digest),
  };
}

module.exports = {
  buildCompactSourceDigest,
  buildPromptSource,
  estimateUtf8Bytes,
  trimForPrompt,
};
