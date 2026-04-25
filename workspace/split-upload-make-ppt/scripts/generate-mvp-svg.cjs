const fs = require('node:fs/promises');
const path = require('node:path');

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeDisplayName(value) {
  return String(value || '')
    .replace(/\.[^.]+$/, '')
    .replace(/-[0-9a-f]{8}$/i, '')
    .replace(/\s*-\s*/g, ' · ')
    .replace(/[_]+/g, ' · ')
    .replace(/\s+/g, ' ')
    .replace(/\s*·\s*/g, ' · ')
    .trim();
}

function slugNumber(index) {
  return String(index + 1).padStart(2, '0');
}

function wrapText(text, maxCharsPerLine = 28, maxLines = 4) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  if (!source) return [];
  const lines = wrapByDisplayWidth(source, maxCharsPerLine, maxLines);
  return balanceShortTails(lines);
}

function charWidth(char) {
  if (/[\u3400-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/.test(char)) return 1;
  if (/[A-Z0-9]/.test(char)) return 0.62;
  if (/\s/.test(char)) return 0.35;
  return 0.55;
}

function displayWidth(value) {
  return Array.from(String(value || '')).reduce((total, char) => total + charWidth(char), 0);
}

function wrapByDisplayWidth(source, maxWidth, maxLines) {
  const lines = [];
  let cursor = 0;
  while (cursor < source.length && lines.length < maxLines) {
    let width = 0;
    let index = cursor;
    let lastSoftBreak = -1;
    while (index < source.length) {
      const char = source[index];
      const nextWidth = width + charWidth(char);
      if (nextWidth > maxWidth && index > cursor) break;
      width = nextWidth;
      index += 1;
      if (/[\s，。；：、,.!?;:)]/.test(char)) lastSoftBreak = index;
    }

    if (lastSoftBreak > cursor && index < source.length && index - lastSoftBreak <= 5) {
      index = lastSoftBreak;
    }
    while (index < source.length && /^[，。；：、,.!?;:)]$/.test(source[index])) {
      index += 1;
    }

    const line = source.slice(cursor, index).trim();
    if (line) lines.push(line);
    cursor = index;
  }

  if (cursor < source.length && lines.length === maxLines) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[，。；：、,.!?;:]$/, '').slice(0, -1)}…`;
  }
  return lines;
}

function balanceShortTails(lines) {
  const result = [...lines];
  for (let index = 1; index < result.length; index += 1) {
    while (
      displayWidth(result[index]) < 3
      && displayWidth(result[index - 1]) - displayWidth(result[index]) > 4
      && Array.from(result[index - 1]).length > 4
    ) {
      const previousChars = Array.from(result[index - 1]);
      const moved = previousChars.pop();
      result[index - 1] = previousChars.join('');
      result[index] = `${moved}${result[index]}`;
    }
  }
  return result;
}

function summarizeSentence(text, max = 72) {
  const source = String(text || '')
    .replace(/[#>*`]/g, ' ')
    .replace(/[-–—]{2,}/g, ' ')
    .replace(/●/g, ' · ')
    .replace(/•/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!source) return '';
  return source.length > max ? `${source.slice(0, max - 1)}…` : source;
}

function shortLabel(text, maxUnits = 14) {
  let source = summarizeSentence(text, 80)
    .replace(/^核心议题[:：]\s*/, '')
    .replace(/^阶段[一二三四五六七八九十]+[:：]\s*/, '')
    .trim();
  const colonIndex = source.search(/[：:]/);
  if (colonIndex > 1 && displayWidth(source.slice(0, colonIndex)) <= maxUnits + 4) {
    source = source.slice(0, colonIndex);
  }
  source = source
    .replace(/^[一二三四五六七八九十]+[、.．]\s*/, '')
    .replace(/^\d+(?:\.\d+)*[.)、．]?\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (displayWidth(source) <= maxUnits) return source;
  let width = 0;
  let end = 0;
  for (const char of source) {
    const nextWidth = width + charWidth(char);
    if (nextWidth > maxUnits - 1) break;
    width = nextWidth;
    end += char.length;
  }
  return `${source.slice(0, Math.max(1, end)).replace(/[，。；：、,.!?;:]$/, '')}…`;
}

function uniqueLines(lines) {
  const seen = new Set();
  const result = [];
  for (const line of lines) {
    const normalized = summarizeSentence(line, 90);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

async function readIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function parseAttributes(tag) {
  const attrs = {};
  for (const match of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)="([^"]*)"/g)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function extractContentAreaBounds(templateSvg) {
  const match = String(templateSvg || '').match(/<rect\b[^>]*stroke-dasharray="[^"]+"[^>]*>/i);
  if (!match) {
    return { x: 80, y: 160, width: 1120, height: 460 };
  }
  const attrs = parseAttributes(match[0]);
  return {
    x: Number(attrs.x || 80),
    y: Number(attrs.y || 160),
    width: Number(attrs.width || 1120),
    height: Number(attrs.height || 460),
  };
}

function splitTitleLines(title, maxUnits = 18) {
  const source = summarizeSentence(title, 80).replace(/\s*·\s*/g, ' · ').trim();
  if (!source) return ['', ''];
  if (displayWidth(source) <= maxUnits) return [source, ''];

  const chars = Array.from(source);
  let bestIndex = -1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let index = 1; index < chars.length - 1; index += 1) {
    if (!/[·：:，,\-—]/.test(chars[index])) continue;
    const left = chars.slice(0, index + 1).join('').trim();
    const right = chars.slice(index + 1).join('').trim();
    const score = Math.abs(displayWidth(left) - displayWidth(right));
    if (left && right && score < bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  }

  if (bestIndex >= 0) {
    return [
      chars.slice(0, bestIndex + 1).join('').trim(),
      chars.slice(bestIndex + 1).join('').trim(),
    ];
  }

  let width = 0;
  let splitAt = 0;
  for (const char of chars) {
    width += charWidth(char);
    splitAt += 1;
    if (width >= maxUnits) break;
  }
  return [
    chars.slice(0, splitAt).join('').trim(),
    chars.slice(splitAt).join('').trim(),
  ];
}

function replacePlaceholders(svg, replacements) {
  return String(svg || '').replace(/{{([A-Z0-9_]+)}}/g, (_, key) => escapeXml(replacements[key] ?? ''));
}

function stripContentGuides(svg) {
  return String(svg || '')
    .replace(/<rect\b[^>]*stroke-dasharray="[^"]+"[^>]*\/>\s*/gi, '')
    .replace(/<rect\b[^>]*stroke-dasharray="[^"]+"[^>]*>[\s\S]*?<\/rect>\s*/gi, '')
    .replace(/<text\b[^>]*>\s*{{CONTENT_AREA}}\s*<\/text>\s*/gi, '')
    .replace(/<text\b[^>]*>\s*\(由 Executor[^<]*<\/text>\s*/gi, '')
    .replace(/<text\b[^>]*>\s*Content Area:[^<]*<\/text>\s*/gi, '')
    .replace(/<text\b[^>]*>\s*Content Area[^<]*<\/text>\s*/gi, '');
}

function cleanupTemplateSvg(svg) {
  return String(svg || '')
    .replace(/<image\b[^>]*href="\.\.\/images\/"\s*[^>]*\/?>\s*/gi, '')
    .replace(/<image\b[^>]*href="\.\.\/images\/"\s*[^>]*>[\s\S]*?<\/image>\s*/gi, '');
}

function sanitizeOfficialTemplateSvg(svg, templateKey) {
  const token = normalizeTemplateToken(templateKey);
  let output = String(svg || '');
  if (/科技蓝商务/.test(token)) {
    output = output
      .replace(/维链医疗云/g, '{{AUTHOR}}')
      .replace(/产品全生命周期管理 · 规范 · 高效 · 可追溯/g, '');
  }
  return output;
}

async function loadProjectTemplates(projectPath) {
  const templatesDir = path.join(projectPath, 'templates');
  const imagesDir = path.join(projectPath, 'images');
  const files = {
    cover: await readIfExists(path.join(templatesDir, '01_cover.svg')),
    toc: await readIfExists(path.join(templatesDir, '02_toc.svg')),
    chapter: await readIfExists(path.join(templatesDir, '02_chapter.svg')),
    content: await readIfExists(path.join(templatesDir, '03_content.svg')),
    ending: await readIfExists(path.join(templatesDir, '04_ending.svg')),
  };
  const imageAssets = await fs.readdir(imagesDir).catch(() => []);
  return {
    ...files,
    available: Boolean(files.cover && files.content && files.ending),
    contentArea: extractContentAreaBounds(files.content),
    imageAssets,
  };
}

function extractDocumentLead(markdown, fallbackProjectName) {
  const lines = String(markdown || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const leadLines = [];
  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line)) break;
    leadLines.push(summarizeSentence(line.replace(/^[-*+]\s+/, ''), 44));
    if (leadLines.length >= 3) break;
  }

  const fallback = normalizeDisplayName(fallbackProjectName) || '自动生成演示文稿';
  const title = leadLines[0] || fallback;
  let subtitle = leadLines[1] || '';
  const overline = fallback && fallback !== title ? fallback : '';
  if (!subtitle && overline && overline !== title) subtitle = overline;

  return { overline, title, subtitle };
}

function parseMarkdownSections(markdown) {
  const raw = String(markdown || '');
  const lines = raw.split(/\r?\n/);
  const sections = [];
  let current = null;

  const pushCurrent = () => {
    if (!current) return;
    current.body = uniqueLines(current.body.map((line) => line.trim()).filter(Boolean)).slice(0, 14);
    if (!current.title && current.body[0]) {
      current.title = summarizeSentence(current.body[0], 26);
      current.body = current.body.slice(1);
    }
    if (current.title || current.body.length) sections.push(current);
  };

  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.+)/);
    if (heading) {
      pushCurrent();
      current = { title: summarizeSentence(heading[1], 34), body: [] };
      continue;
    }
    if (!current) current = { title: '', body: [] };
    const cleaned = line
      .replace(/^[-*+]\s+/, '')
      .replace(/^\d+[.)]\s+/, '')
      .replace(/^\*\*(.*)\*\*$/, '$1')
      .trim();
    if (cleaned) current.body.push(summarizeSentence(cleaned, 96));
  }

  pushCurrent();
  return sections.filter((section) => section.title || section.body.length);
}

function inferPageTarget(pagesLabel) {
  const source = String(pagesLabel || '10-12 页');
  const nums = source.match(/\d+/g)?.map(Number).filter(Boolean) || [];
  if (nums.length >= 2) return Math.max(8, Math.min(12, Math.round((nums[0] + nums[1]) / 2)));
  if (nums.length === 1) return Math.max(8, Math.min(12, nums[0]));
  return 10;
}

function meaningfulLines(section, max = 4) {
  const greetingPattern = /(大家好|各位来宾|各位合作伙伴|各位同事|各位朋友)/;
  return (section?.body || [])
    .filter((line) => line && !greetingPattern.test(line) && line.length >= 8)
    .map((line) => summarizeSentence(line, 52))
    .slice(0, max);
}

function extractCoverBodyLines(sections, prompt) {
  const intro = sections[0];
  const lines = uniqueLines([
    ...sections.slice(0, 3).map((section) => section.title ? `核心议题：${shortLabel(section.title, 22)}` : ''),
    ...meaningfulLines(intro, 2).map((line) => shortLabel(line, 26)),
    prompt ? summarizeSentence(prompt, 36) : '',
  ]);
  return lines.slice(0, 3);
}

function deriveCoverTitle(leadTitle, fallbackTitle, introTitle) {
  const direct = [leadTitle, introTitle, fallbackTitle]
    .map((value) => summarizeSentence(value, 48))
    .find((value) => value && displayWidth(value) <= 20);
  if (direct) return direct;

  const source = summarizeSentence(leadTitle || fallbackTitle || introTitle, 80);
  const parts = source
    .split(/[·|｜\-—]/)
    .map((part) => part.trim())
    .map((part) => part.replace(/^第\d+册$/, '').replace(/正式汇报版/g, '').trim())
    .filter((part) => part && !/^20\d{2}/.test(part));

  if (parts.length >= 2) {
    const combined = `${parts[0]} · ${parts[parts.length - 1]}`;
    if (displayWidth(combined) <= 22) return combined;
  }

  const bestPart = [...parts].sort((left, right) => displayWidth(right) - displayWidth(left))[0];
  if (bestPart && displayWidth(bestPart) <= 20) return bestPart;
  if (introTitle) return shortLabel(introTitle, 20);
  return shortLabel(source, 20);
}

function deriveCoverSubtitle(leadSubtitle, introTitle, templateName, audience, coverTitle) {
  const direct = [leadSubtitle, introTitle]
    .map((value) => summarizeSentence(value, 42))
    .find((value) => value && displayWidth(value) <= 24 && value !== coverTitle);
  if (direct) return direct;
  return `${templateName} · ${audience || '核心汇报'}`;
}

function buildDeckPlan({ projectName, templateName, prompt, audience, sections, pagesLabel, lead }) {
  const targetPages = inferPageTarget(pagesLabel);
  const cleanSections = sections.length
    ? sections
    : [{ title: '项目背景', body: [prompt || '从上传文档中提取核心信息并形成高端演示稿。'] }];
  const startsWithLead = cleanSections[0]
    && (cleanSections[0].title === lead.title || cleanSections[0].body?.[0] === lead.subtitle);
  const contentSections = startsWithLead && cleanSections.length > 1 ? cleanSections.slice(1) : cleanSections;
  const intro = contentSections[0] || cleanSections[0];
  const highlights = uniqueLines(contentSections.slice(0, 5).map((section) => shortLabel(section.title || section.body[0] || '核心要点')));
  const cleanedProjectName = normalizeDisplayName(projectName);
  const coverBodyLines = extractCoverBodyLines(contentSections, prompt);
  const coverTitle = deriveCoverTitle(lead.title, cleanedProjectName, intro.title);
  const coverSubtitle = deriveCoverSubtitle(lead.subtitle, intro.title, templateName, audience, coverTitle);
  const slides = [];

  slides.push({
    kind: 'cover',
    eyebrow: lead.overline || cleanedProjectName,
    title: coverTitle || cleanedProjectName || '自动生成演示文稿',
    subtitle: coverSubtitle,
    bodyLines: coverBodyLines.length
      ? coverBodyLines
      : [intro.title ? `核心议题：${intro.title}` : summarizeSentence(prompt || '自动生成的高端演示文稿', 36), '面向管理层决策汇报', '输出：原生可编辑 PPTX'],
  });

  slides.push({
    kind: 'toc',
    title: '汇报主线',
    subtitle: '将源文档拆成可汇报的战略逻辑',
    bodyLines: highlights.slice(0, 5),
  });

  slides.push({
    kind: 'summary',
    title: '执行摘要',
    subtitle: intro.title || '结论先行',
    bodyLines: uniqueLines([...(meaningfulLines(intro, 5)), ...highlights]).slice(0, 5),
  });

  slides.push({
    kind: 'framework',
    title: '战略判断框架',
    subtitle: '从背景、能力、路径三个层次理解本次转型',
    bodyLines: uniqueLines([
      contentSections[0]?.title ? shortLabel(contentSections[0].title, 16) : '战略背景',
      contentSections[1]?.title ? shortLabel(contentSections[1].title, 16) : '核心能力',
      contentSections[2]?.title ? shortLabel(contentSections[2].title, 16) : '增长路径',
      contentSections[3]?.title ? shortLabel(contentSections[3].title, 16) : '组织升级',
    ]).slice(0, 4),
  });

  const contentSlides = [];
  const sectionPool = contentSections.length ? contentSections : cleanSections;
  for (const section of sectionPool) {
    if (contentSlides.length >= 6) break;
    const body = meaningfulLines(section, 8);
    const chunks = [];
    for (let index = 0; index < body.length; index += 3) chunks.push(body.slice(index, index + 3));
    if (!chunks.length) chunks.push([section.title || '内容待补充']);
    for (const chunk of chunks) {
      const kind = contentSlides.length % 3 === 0 ? 'three_cards' : contentSlides.length % 3 === 1 ? 'split' : 'quote';
      contentSlides.push({
        kind,
        title: section.title || '核心内容',
        subtitle: summarizeSentence(chunk[0] || prompt || '自动生成内容页', 42),
        bodyLines: chunk,
      });
      if (contentSlides.length >= 6) break;
    }
  }

  const contentTarget = Math.max(3, Math.min(6, targetPages - 6));
  while (contentSlides.length < contentTarget) {
    const seed = sectionPool[contentSlides.length % sectionPool.length] || intro;
    contentSlides.push({
      kind: contentSlides.length % 2 === 0 ? 'three_cards' : 'split',
      title: seed.title || '重点展开',
      subtitle: '根据源文档自动补足的内容页',
      bodyLines: meaningfulLines(seed, 3).length ? meaningfulLines(seed, 3) : highlights.slice(0, 3),
    });
  }

  slides.push(...contentSlides.slice(0, contentTarget));

  slides.push({
    kind: 'timeline',
    title: '推进节奏与落地路径',
    subtitle: '把文档结论转化为可执行步骤',
    bodyLines: uniqueLines([
      '阶段一：统一战略叙事与关键假设',
      '阶段二：完成能力模块化与系统化验证',
      '阶段三：规模化复制并形成组织控制力',
      '阶段四：沉淀数据、资产与可复用模板',
    ]),
  });

  slides.push({
    kind: 'ending',
    title: '结论与下一步',
    subtitle: '从内容理解走向行动闭环',
    bodyLines: uniqueLines([
      `围绕「${highlights[0] || '核心议题'}」形成统一判断。`,
      '将文档中的关键结论转化为路线图、责任人和里程碑。',
      '后续可继续补齐数据图表、品牌素材与案例证据。',
    ]),
  });

  return slides.slice(0, 12);
}

const THEMES = {
  consulting: {
    bg: '#F6F3EC',
    ink: '#111827',
    navy: '#071426',
    navy2: '#0E2547',
    muted: '#667085',
    card: '#FFFFFF',
    soft: '#ECE7DC',
    line: '#D8D1C2',
    accent: '#D96C2C',
    accent2: '#2B6CB0',
    accent3: '#16A085',
    coverVariant: 'executive',
    tocVariant: 'cards',
  },
  google: {
    bg: '#F8FAFC',
    ink: '#0F172A',
    navy: '#0B57D0',
    navy2: '#3B82F6',
    muted: '#64748B',
    card: '#FFFFFF',
    soft: '#E6F0FF',
    line: '#D9E6F7',
    accent: '#2563EB',
    accent2: '#34A853',
    accent3: '#FBBC04',
    coverVariant: 'minimal',
    tocVariant: 'bright',
  },
  anthropic: {
    bg: '#F5EFE6',
    ink: '#2C241E',
    navy: '#5B4636',
    navy2: '#8B6A4D',
    muted: '#7C6A58',
    card: '#FFFDF8',
    soft: '#ECE1D2',
    line: '#D8CABB',
    accent: '#C26D3F',
    accent2: '#8C6A4E',
    accent3: '#5B8A72',
    coverVariant: 'editorial',
    tocVariant: 'soft',
  },
  techDark: {
    bg: '#0B1220',
    ink: '#E5EDF9',
    navy: '#040B16',
    navy2: '#12233F',
    muted: '#93A4BF',
    card: '#101B31',
    soft: '#142238',
    line: '#233653',
    accent: '#00C2FF',
    accent2: '#7C3AED',
    accent3: '#22C55E',
    coverVariant: 'spotlight',
    tocVariant: 'dark',
  },
  govRed: {
    bg: '#FFF7F5',
    ink: '#431111',
    navy: '#A61B29',
    navy2: '#D14343',
    muted: '#8A5D5D',
    card: '#FFFFFF',
    soft: '#FDE7E3',
    line: '#F2C9C0',
    accent: '#C62828',
    accent2: '#D4AF37',
    accent3: '#9A3412',
    coverVariant: 'ceremony',
    tocVariant: 'ribbon',
  },
  govBlue: {
    bg: '#F5F9FF',
    ink: '#0F2747',
    navy: '#0E3A75',
    navy2: '#1565C0',
    muted: '#61738B',
    card: '#FFFFFF',
    soft: '#E4EFFB',
    line: '#CADBF0',
    accent: '#1565C0',
    accent2: '#D32F2F',
    accent3: '#4F8DD8',
    coverVariant: 'ceremonyBlue',
    tocVariant: 'ribbon',
  },
  finance: {
    bg: '#F4FBF7',
    ink: '#0B2F22',
    navy: '#0E5B43',
    navy2: '#117A5A',
    muted: '#5B7469',
    card: '#FFFFFF',
    soft: '#E1F2E8',
    line: '#C5E1D1',
    accent: '#16825D',
    accent2: '#D6A84F',
    accent3: '#2F7D8C',
    coverVariant: 'minimal',
    tocVariant: 'cards',
  },
  enterprise: {
    bg: '#F5F7FB',
    ink: '#132238',
    navy: '#12355B',
    navy2: '#1F5E8A',
    muted: '#6B7C93',
    card: '#FFFFFF',
    soft: '#E6EEF7',
    line: '#D3DDE8',
    accent: '#2B6CB0',
    accent2: '#F59E0B',
    accent3: '#22C55E',
    coverVariant: 'minimal',
    tocVariant: 'cards',
  },
  academic: {
    bg: '#F9FBFE',
    ink: '#16233B',
    navy: '#243B6B',
    navy2: '#3656A6',
    muted: '#62708B',
    card: '#FFFFFF',
    soft: '#E7EDFA',
    line: '#CCD6EE',
    accent: '#3157B7',
    accent2: '#6C8AE4',
    accent3: '#8AA1D6',
    coverVariant: 'minimal',
    tocVariant: 'bright',
  },
  medical: {
    bg: '#F5FCFC',
    ink: '#103235',
    navy: '#0F4C5C',
    navy2: '#178B8D',
    muted: '#688184',
    card: '#FFFFFF',
    soft: '#DFF2F3',
    line: '#C2E2E3',
    accent: '#0EA5A4',
    accent2: '#38BDF8',
    accent3: '#10B981',
    coverVariant: 'minimal',
    tocVariant: 'bright',
  },
  wellness: {
    bg: '#FBF8FD',
    ink: '#302047',
    navy: '#6A4C93',
    navy2: '#B185DB',
    muted: '#7B6D96',
    card: '#FFFFFF',
    soft: '#F0E6FA',
    line: '#DDCCEF',
    accent: '#9D4EDD',
    accent2: '#F28482',
    accent3: '#84A59D',
    coverVariant: 'editorial',
    tocVariant: 'soft',
  },
  retro: {
    bg: '#1B1430',
    ink: '#F7F09A',
    navy: '#120D20',
    navy2: '#2D1B4E',
    muted: '#B7AFD4',
    card: '#241942',
    soft: '#302250',
    line: '#4D3B74',
    accent: '#FF5EA8',
    accent2: '#00E5FF',
    accent3: '#FDE047',
    coverVariant: 'retro',
    tocVariant: 'retro',
  },
};

function normalizeTemplateToken(...values) {
  return values
    .filter(Boolean)
    .map((value) => String(value).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ''))
    .join('|');
}

function themeFor(templateKey = '', templateName = '') {
  const token = normalizeTemplateToken(templateKey, templateName);
  if (/exhibit|mckinsey/.test(token)) return THEMES.consulting;
  if (/googlestyle|google/.test(token)) return THEMES.google;
  if (/anthropic/.test(token)) return THEMES.anthropic;
  if (/enterprisedigitalintelligence|aiops/.test(token)) return THEMES.techDark;
  if (/governmentred|smartred/.test(token)) return THEMES.govRed;
  if (/governmentblue/.test(token)) return THEMES.govBlue;
  if (/招商银行/.test(token)) return THEMES.finance;
  if (/科技蓝商务|中国电建|中汽研/.test(token)) return THEMES.enterprise;
  if (/academicdefense/.test(token)) return THEMES.academic;
  if (/medicaluniversity/.test(token)) return THEMES.medical;
  if (/psychologyhealing/.test(token)) return THEMES.wellness;
  if (/pixelretro/.test(token)) return THEMES.retro;
  return THEMES.consulting;
}

function textLines(lines, { x, y, size = 24, fill, weight = 400, maxChars = 28, maxLines = 3, lineGap = 32, anchor = 'start' }) {
  const rendered = [];
  let cursorY = y;
  for (const line of lines) {
    const wrapped = wrapText(line, maxChars, maxLines);
    for (const item of wrapped) {
      rendered.push(`<text x="${x}" y="${cursorY}"${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''} font-size="${size}" font-weight="${weight}" fill="${fill}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(item)}</text>`);
      cursorY += lineGap;
    }
  }
  return rendered.join('\n');
}

function pageChrome(theme, pageNo, totalPages, eyebrow = '') {
  return `
  <text x="80" y="660" font-size="14" fill="${theme.muted}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(eyebrow || 'AI PPT Factory')}</text>
  <text x="1200" y="660" text-anchor="end" font-size="14" fill="${theme.muted}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${pageNo}/${totalPages}</text>`;
}

function shellSvg(inner) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
${inner}
</svg>`;
}

function deckDateLabel() {
  return new Date().toISOString().slice(0, 10);
}

function baseTemplateReplacements(input) {
  const [titleLine1, titleLine2] = splitTitleLines(input.title, 18);
  const [pageTitleLine1, pageTitleLine2] = splitTitleLines(shortLabel(input.title, 28), 16);
  const body = input.bodyLines || [];
  const highlights = body.slice(0, 3).map((line) => shortLabel(line, 18));
  const contact = shortLabel(input.eyebrow || input.projectName || 'AI PPT Factory', 24);
  const logoAsset = (input.templates?.imageAssets || []).find((name) => /\.(png|jpg|jpeg|webp|svg)$/i.test(name)) || '';
  return {
    TITLE: titleLine1 || input.title || '',
    TITLE_LINE2: titleLine2,
    SUBTITLE: input.subtitle || '',
    TITLE_EN: '',
    DATE: deckDateLabel(),
    AUTHOR: input.audience || '核心汇报',
    AUTHOR_EN: '',
    PRESENTER: input.audience || '核心汇报',
    PROJECT_CODE: `${String(input.projectName || 'DECK').replace(/[^\w\u4e00-\u9fff]+/g, '').slice(0, 12) || 'DECK'}-${deckDateLabel().replace(/-/g, '')}`,
    LOGO: input.templateName || 'PPT',
    LOGO_LARGE: logoAsset,
    PAGE_NUM: input.pageNo,
    TOTAL_PAGES: String(input.totalPages || ''),
    PAGE_TITLE: pageTitleLine1 || shortLabel(input.title, 24),
    PAGE_TITLE_LINE2: pageTitleLine2,
    PAGE_TITLE_EN: '',
    SECTION_NUM: input.sectionNum || input.pageNo,
    SECTION_NAME: shortLabel(input.sectionName || input.title, 20),
    KEY_MESSAGE: summarizeSentence(input.subtitle || body[0] || input.title, 56),
    SOURCE: 'Source document',
    NOTE: '',
    CHAPTER_NUM: input.sectionNum || input.pageNo,
    CHAPTER_TITLE: shortLabel(input.title, 24),
    CHAPTER_TITLE_EN: '',
    TOC_ITEM_1_TITLE: input.tocItems?.[0]?.title || '',
    TOC_ITEM_1_DESC: input.tocItems?.[0]?.desc || '',
    TOC_ITEM_2_TITLE: input.tocItems?.[1]?.title || '',
    TOC_ITEM_2_DESC: input.tocItems?.[1]?.desc || '',
    TOC_ITEM_3_TITLE: input.tocItems?.[2]?.title || '',
    TOC_ITEM_3_DESC: input.tocItems?.[2]?.desc || '',
    TOC_ITEM_4_TITLE: input.tocItems?.[3]?.title || '',
    TOC_ITEM_4_DESC: input.tocItems?.[3]?.desc || '',
    TOC_ITEM_5_TITLE: input.tocItems?.[4]?.title || '',
    TOC_ITEM_5_DESC: input.tocItems?.[4]?.desc || '',
    TOC_ITEM_6_TITLE: input.tocItems?.[5]?.title || '',
    TOC_ITEM_6_DESC: input.tocItems?.[5]?.desc || '',
    THANK_YOU: '感谢聆听',
    THANK_YOU_EN: 'THANK YOU',
    ENDING_SUBTITLE: input.subtitle || '期待进一步交流',
    END_SUBTITLE: input.subtitle || 'NEXT STEP READY',
    CONTACT_INFO: contact,
    CONTACT_NAME: contact,
    CONTACT_TITLE: input.audience || '汇报版本',
    CONTACT_EMAIL: '',
    CONTACT_PHONE: '',
    CONTACT_URL: '',
    CONTACT_LINE_2: '',
    EMAIL: '',
    THANKS_PERSON_1: highlights[0] || '统一判断',
    THANKS_REASON_1: '把核心观点沉淀为可执行结论',
    THANKS_PERSON_2: highlights[1] || '关键路径',
    THANKS_REASON_2: '明确后续推进节奏与优先级',
    THANKS_PERSON_3: highlights[2] || '行动闭环',
    THANKS_REASON_3: '为下一轮汇报预留扩展空间',
    SUMMARY_1_TITLE: highlights[0] || '统一判断',
    SUMMARY_2_TITLE: highlights[1] || '关键路径',
    SUMMARY_3_TITLE: highlights[2] || '下一步',
  };
}

function buildTocItems(sections, fallbackLines = []) {
  const items = [];
  for (const section of sections.slice(0, 6)) {
    items.push({
      title: shortLabel(section.title || section.body?.[0] || '核心模块', 18),
      desc: summarizeSentence(section.body?.[0] || section.title || '核心内容概览', 24),
    });
  }
  for (const line of fallbackLines.slice(0, 6 - items.length)) {
    items.push({ title: shortLabel(line, 18), desc: '核心内容概览' });
  }
  return items.slice(0, 6);
}

function renderInnerSummary(slide, theme, area) {
  const gap = 22;
  const cardWidth = (area.width - gap) / 2;
  const cardHeight = (area.height - gap) / 2;
  return slide.bodyLines.slice(0, 4).map((line, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = area.x + column * (cardWidth + gap);
    const y = area.y + row * (cardHeight + gap);
    const color = index % 2 === 0 ? theme.accent : theme.accent2;
    return `
    <rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="20" fill="${theme.card}" stroke="${theme.line}" />
    <rect x="${x}" y="${y}" width="8" height="${cardHeight}" rx="4" fill="${color}" />
    <text x="${x + 26}" y="${y + 52}" font-size="32" font-weight="700" fill="${color}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">0${index + 1}</text>
    ${textLines([line], { x: x + 26, y: y + 100, size: 24, fill: theme.ink, weight: 700, maxChars: 20, maxLines: 4, lineGap: 30 })}`;
  }).join('');
}

function renderInnerThreeCards(slide, theme, area) {
  const count = Math.max(1, Math.min(3, slide.bodyLines.length || 1));
  const gap = 22;
  const cardWidth = (area.width - gap * (count - 1)) / count;
  return slide.bodyLines.slice(0, count).map((line, index) => {
    const x = area.x + index * (cardWidth + gap);
    const y = area.y + 20;
    const color = index === 0 ? theme.accent : index === 1 ? theme.accent2 : theme.accent3;
    return `
    <rect x="${x}" y="${y}" width="${cardWidth}" height="${area.height - 40}" rx="24" fill="${theme.card}" stroke="${theme.line}" />
    <rect x="${x}" y="${y}" width="${cardWidth}" height="10" rx="5" fill="${color}" />
    <text x="${x + 28}" y="${y + 64}" font-size="42" font-weight="700" fill="${color}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">0${index + 1}</text>
    ${textLines([line], { x: x + 28, y: y + 126, size: 24, fill: theme.ink, weight: 700, maxChars: 14, maxLines: 5, lineGap: 30 })}`;
  }).join('');
}

function renderInnerFramework(slide, theme, area) {
  const gap = 22;
  const cellWidth = (area.width - gap) / 2;
  const cellHeight = (area.height - gap) / 2;
  return slide.bodyLines.slice(0, 4).map((line, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = area.x + column * (cellWidth + gap);
    const y = area.y + row * (cellHeight + gap);
    const dark = index === 0;
    return `
    <rect x="${x}" y="${y}" width="${cellWidth}" height="${cellHeight}" rx="22" fill="${dark ? theme.navy : theme.card}" stroke="${theme.line}" />
    <text x="${x + 24}" y="${y + 42}" font-size="16" fill="${dark ? '#AFC2DC' : theme.muted}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">MODULE ${index + 1}</text>
    ${textLines([line], { x: x + 24, y: y + 94, size: 26, fill: dark ? '#FFFFFF' : theme.ink, weight: 700, maxChars: 16, maxLines: 3, lineGap: 32 })}`;
  }).join('');
}

function renderInnerSplit(slide, theme, area) {
  const leftWidth = Math.max(320, area.width * 0.38);
  const rightX = area.x + leftWidth + 24;
  const bullets = slide.bodyLines.slice(0, 4).map((line, index) => `
    <circle cx="${rightX + 12}" cy="${area.y + 66 + index * 90}" r="12" fill="${theme.accent}" />
    ${textLines([line], { x: rightX + 40, y: area.y + 74 + index * 90, size: 24, fill: theme.ink, weight: 700, maxChars: 24, maxLines: 2, lineGap: 30 })}`).join('');
  return `
    <rect x="${area.x}" y="${area.y}" width="${leftWidth}" height="${area.height}" rx="24" fill="${theme.navy}" />
    ${textLines([slide.title], { x: area.x + 28, y: area.y + 72, size: 38, fill: '#FFFFFF', weight: 700, maxChars: 12, maxLines: 4, lineGap: 46 })}
    ${textLines([slide.subtitle], { x: area.x + 28, y: area.y + area.height - 34, size: 20, fill: '#D9E6F8', maxChars: 18, maxLines: 2, lineGap: 26 })}
    ${bullets}`;
}

function renderInnerQuote(slide, theme, area) {
  const quote = slide.bodyLines[0] || slide.subtitle || slide.title;
  const supports = slide.bodyLines.slice(1, 4);
  const supportWidth = (area.width - 44) / 3;
  const supportCards = supports.map((line, index) => `
    <rect x="${area.x + index * (supportWidth + 22)}" y="${area.y + area.height - 128}" width="${supportWidth}" height="96" rx="18" fill="${theme.card}" stroke="${theme.line}" />
    ${textLines([line], { x: area.x + 20 + index * (supportWidth + 22), y: area.y + area.height - 76, size: 18, fill: theme.ink, weight: 700, maxChars: 14, maxLines: 2, lineGap: 24 })}`).join('');
  return `
    <rect x="${area.x}" y="${area.y}" width="${area.width}" height="${area.height}" rx="28" fill="${theme.navy}" />
    <text x="${area.x + 34}" y="${area.y + 96}" font-size="80" font-weight="700" fill="${theme.accent}" font-family="Georgia, serif">“</text>
    ${textLines([quote], { x: area.x + 88, y: area.y + 120, size: 38, fill: '#FFFFFF', weight: 700, maxChars: 24, maxLines: 4, lineGap: 48 })}
    ${supportCards}`;
}

function renderInnerTimeline(slide, theme, area) {
  const items = slide.bodyLines.slice(0, 4);
  const startX = area.x + 90;
  const endX = area.x + area.width - 90;
  const y = area.y + area.height / 2;
  const step = items.length > 1 ? (endX - startX) / (items.length - 1) : 0;
  const nodes = items.map((line, index) => `
    <circle cx="${startX + index * step}" cy="${y}" r="24" fill="${index % 2 === 0 ? theme.accent : theme.accent2}" />
    <text x="${startX + index * step}" y="${y + 8}" text-anchor="middle" font-size="18" font-weight="700" fill="#FFFFFF" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${index + 1}</text>
    ${textLines([line.replace(/^阶段[一二三四五六七八九十]：/, '')], { x: startX + index * step - 60, y: y + 74, size: 20, fill: theme.ink, weight: 700, maxChars: 12, maxLines: 3, lineGap: 24, anchor: 'start' })}`).join('');
  return `
    <line x1="${startX}" y1="${y}" x2="${endX}" y2="${y}" stroke="${theme.line}" stroke-width="6" />
    ${nodes}`;
}

function renderInnerContent(slide, theme, area) {
  if (slide.kind === 'summary') return renderInnerSummary(slide, theme, area);
  if (slide.kind === 'framework') return renderInnerFramework(slide, theme, area);
  if (slide.kind === 'split') return renderInnerSplit(slide, theme, area);
  if (slide.kind === 'quote') return renderInnerQuote(slide, theme, area);
  if (slide.kind === 'timeline') return renderInnerTimeline(slide, theme, area);
  return renderInnerThreeCards(slide, theme, area);
}

function renderOfficialCover(slide, theme, templates) {
  const source = sanitizeOfficialTemplateSvg(templates.cover, slide.templateKey);
  return cleanupTemplateSvg(replacePlaceholders(source, baseTemplateReplacements(slide)));
}

function renderOfficialToc(slide, theme, templates) {
  const source = sanitizeOfficialTemplateSvg(templates.toc, slide.templateKey);
  return cleanupTemplateSvg(replacePlaceholders(source, baseTemplateReplacements(slide)));
}

function renderOfficialEnding(slide, theme, templates) {
  const source = sanitizeOfficialTemplateSvg(templates.ending, slide.templateKey);
  return cleanupTemplateSvg(replacePlaceholders(source, baseTemplateReplacements(slide)));
}

function renderOfficialContent(slide, theme, templates) {
  const area = templates.contentArea || { x: 80, y: 160, width: 1120, height: 460 };
  const inner = renderInnerContent(slide, theme, area);
  const cleaned = stripContentGuides(sanitizeOfficialTemplateSvg(templates.content, slide.templateKey));
  const filled = cleanupTemplateSvg(replacePlaceholders(cleaned, baseTemplateReplacements(slide)));
  return filled.replace(/<\/svg>\s*$/i, `${inner}\n</svg>`);
}

function renderCoverExecutive(slide, theme, pageNo, totalPages) {
  const title = textLines([slide.title], { x: 88, y: 172, size: 52, fill: '#FFFFFF', weight: 700, maxChars: 16, maxLines: 3, lineGap: 64 });
  const subtitle = textLines([slide.subtitle], { x: 92, y: 370, size: 24, fill: '#D9E6F8', maxChars: 28, maxLines: 2, lineGap: 34 });
  const bullets = slide.bodyLines.slice(0, 3).map((line, index) => `
    <rect x="92" y="${458 + index * 54}" width="9" height="9" rx="4.5" fill="${theme.accent}" />
    ${textLines([summarizeSentence(line, 34)], { x: 118, y: 468 + index * 54, size: 21, fill: '#FFFFFF', maxChars: 28, maxLines: 1, lineGap: 28 })}`).join('');
  return shellSvg(`
  <rect width="1280" height="720" fill="${theme.navy}" />
  <rect x="735" y="0" width="545" height="720" fill="${theme.navy2}" opacity="0.90" />
  <circle cx="1110" cy="116" r="238" fill="${theme.accent2}" opacity="0.22" />
  <circle cx="974" cy="640" r="250" fill="${theme.accent}" opacity="0.13" />
  <rect x="72" y="92" width="72" height="6" rx="3" fill="${theme.accent}" />
  <text x="88" y="124" font-size="18" fill="#AFC2DC" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.eyebrow || '')}</text>
  ${title}
  ${subtitle}
  <rect x="88" y="420" width="640" height="176" rx="28" fill="#FFFFFF" opacity="0.08" stroke="#FFFFFF" stroke-opacity="0.14" />
  ${bullets}
  <text x="1190" y="660" text-anchor="end" font-size="14" fill="#AFC2DC" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${pageNo}/${totalPages}</text>`);
}

function renderCoverMinimal(slide, theme, pageNo, totalPages) {
  const bulletCards = slide.bodyLines.slice(0, 3).map((line, index) => `
  <rect x="${108 + index * 320}" y="484" width="276" height="92" rx="22" fill="${theme.card}" stroke="${theme.line}" />
  <rect x="${128 + index * 320}" y="508" width="42" height="8" rx="4" fill="${index === 0 ? theme.accent : index === 1 ? theme.accent2 : theme.accent3}" />
  ${textLines([summarizeSentence(line, 28)], { x: 128 + index * 320, y: 552, size: 21, fill: theme.ink, weight: 700, maxChars: 15, maxLines: 2, lineGap: 26 })}`).join('');
  return shellSvg(`
  <rect width="1280" height="720" fill="${theme.bg}" />
  <circle cx="1120" cy="126" r="200" fill="${theme.soft}" />
  <circle cx="1060" cy="566" r="168" fill="${theme.accent}" opacity="0.10" />
  <rect x="78" y="82" width="12" height="520" rx="6" fill="${theme.accent}" />
  <text x="112" y="124" font-size="18" fill="${theme.muted}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.eyebrow || '')}</text>
  ${textLines([slide.title], { x: 108, y: 198, size: 50, fill: theme.ink, weight: 700, maxChars: 16, maxLines: 3, lineGap: 60 })}
  ${textLines([slide.subtitle], { x: 112, y: 358, size: 24, fill: theme.muted, weight: 400, maxChars: 28, maxLines: 2, lineGap: 34 })}
  <rect x="870" y="110" width="272" height="236" rx="32" fill="${theme.card}" stroke="${theme.line}" />
  <text x="910" y="166" font-size="16" fill="${theme.muted}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">TEMPLATE MOOD</text>
  <text x="910" y="228" font-size="64" font-weight="700" fill="${theme.accent}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">01</text>
  <text x="910" y="286" font-size="26" font-weight="700" fill="${theme.ink}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">简洁、明亮、现代</text>
  <text x="910" y="324" font-size="20" fill="${theme.muted}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">适合科技、学术、金融和企业类汇报</text>
  ${bulletCards}
  <text x="1190" y="660" text-anchor="end" font-size="14" fill="${theme.muted}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${pageNo}/${totalPages}</text>`);
}

function renderCoverEditorial(slide, theme, pageNo, totalPages) {
  const bullets = slide.bodyLines.slice(0, 3).map((line, index) => `
  <rect x="782" y="${212 + index * 112}" width="370" height="84" rx="20" fill="${theme.card}" stroke="${theme.line}" />
  <circle cx="818" cy="${252 + index * 112}" r="10" fill="${index === 0 ? theme.accent : index === 1 ? theme.accent2 : theme.accent3}" />
  ${textLines([summarizeSentence(line, 30)], { x: 846, y: 260 + index * 112, size: 22, fill: theme.ink, weight: 700, maxChars: 16, maxLines: 2, lineGap: 28 })}`).join('');
  return shellSvg(`
  <rect width="1280" height="720" fill="${theme.bg}" />
  <rect x="0" y="0" width="468" height="720" fill="${theme.soft}" />
  <circle cx="252" cy="164" r="118" fill="${theme.accent}" opacity="0.15" />
  <rect x="86" y="86" width="94" height="8" rx="4" fill="${theme.accent}" />
  <text x="88" y="126" font-size="18" fill="${theme.muted}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.eyebrow || '')}</text>
  ${textLines([slide.title], { x: 88, y: 210, size: 48, fill: theme.ink, weight: 700, maxChars: 12, maxLines: 4, lineGap: 58 })}
  ${textLines([slide.subtitle], { x: 92, y: 474, size: 24, fill: theme.muted, weight: 400, maxChars: 16, maxLines: 3, lineGap: 34 })}
  <text x="780" y="126" font-size="18" fill="${theme.muted}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">EDITORIAL NOTES</text>
  ${bullets}
  <text x="1190" y="660" text-anchor="end" font-size="14" fill="${theme.muted}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${pageNo}/${totalPages}</text>`);
}

function renderCoverSpotlight(slide, theme, pageNo, totalPages) {
  const chips = slide.bodyLines.slice(0, 3).map((line, index) => `
  <rect x="${160 + index * 320}" y="520" width="280" height="58" rx="29" fill="${theme.card}" stroke="${index === 0 ? theme.accent : index === 1 ? theme.accent2 : theme.accent3}" stroke-width="2" />
  <text x="${300 + index * 320}" y="556" text-anchor="middle" font-size="20" fill="${theme.ink}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(shortLabel(line, 18))}</text>`).join('');
  return shellSvg(`
  <rect width="1280" height="720" fill="${theme.bg}" />
  <circle cx="642" cy="242" r="248" fill="${theme.accent}" opacity="0.12" />
  <circle cx="980" cy="162" r="210" fill="${theme.accent2}" opacity="0.10" />
  <rect x="116" y="120" width="1048" height="292" rx="40" fill="${theme.navy}" stroke="${theme.line}" />
  <text x="154" y="166" font-size="18" fill="${theme.muted}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.eyebrow || '')}</text>
  ${textLines([slide.title], { x: 150, y: 244, size: 54, fill: '#FFFFFF', weight: 700, maxChars: 18, maxLines: 2, lineGap: 64 })}
  ${textLines([slide.subtitle], { x: 154, y: 336, size: 24, fill: '#BFD0EA', weight: 400, maxChars: 30, maxLines: 2, lineGap: 32 })}
  ${chips}
  <text x="1190" y="660" text-anchor="end" font-size="14" fill="${theme.muted}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${pageNo}/${totalPages}</text>`);
}

function renderCoverCeremony(slide, theme, pageNo, totalPages) {
  const bullets = slide.bodyLines.slice(0, 3).map((line, index) => `
  <text x="306" y="${498 + index * 42}" font-size="22" fill="${theme.ink}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(`• ${shortLabel(line, 26)}`)}</text>`).join('');
  return shellSvg(`
  <rect width="1280" height="720" fill="${theme.bg}" />
  <rect x="0" y="0" width="1280" height="24" fill="${theme.accent}" />
  <rect x="0" y="24" width="1280" height="8" fill="${theme.accent2}" />
  <rect x="104" y="118" width="1072" height="430" rx="36" fill="${theme.card}" stroke="${theme.line}" />
  <text x="306" y="182" font-size="18" fill="${theme.muted}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.eyebrow || '')}</text>
  ${textLines([slide.title], { x: 302, y: 268, size: 52, fill: theme.navy, weight: 700, maxChars: 18, maxLines: 2, lineGap: 62 })}
  ${textLines([slide.subtitle], { x: 306, y: 376, size: 24, fill: theme.muted, weight: 400, maxChars: 28, maxLines: 2, lineGap: 34 })}
  <rect x="306" y="426" width="668" height="2" fill="${theme.line}" />
  ${bullets}
  <text x="1190" y="660" text-anchor="end" font-size="14" fill="${theme.muted}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${pageNo}/${totalPages}</text>`);
}

function renderCoverRetro(slide, theme, pageNo, totalPages) {
  const bullets = slide.bodyLines.slice(0, 3).map((line, index) => `
  <rect x="118" y="${456 + index * 64}" width="18" height="18" fill="${index === 0 ? theme.accent : index === 1 ? theme.accent2 : theme.accent3}" />
  <text x="158" y="${472 + index * 64}" font-size="22" fill="${theme.ink}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(shortLabel(line, 24))}</text>`).join('');
  return shellSvg(`
  <rect width="1280" height="720" fill="${theme.bg}" />
  <rect x="78" y="74" width="1124" height="572" fill="${theme.navy}" stroke="${theme.accent2}" stroke-width="4" />
  <rect x="118" y="114" width="86" height="18" fill="${theme.accent}" />
  <rect x="218" y="114" width="86" height="18" fill="${theme.accent2}" />
  <rect x="318" y="114" width="86" height="18" fill="${theme.accent3}" />
  <text x="118" y="170" font-size="18" fill="${theme.muted}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.eyebrow || '')}</text>
  ${textLines([slide.title], { x: 118, y: 250, size: 50, fill: theme.ink, weight: 700, maxChars: 14, maxLines: 3, lineGap: 62 })}
  ${textLines([slide.subtitle], { x: 122, y: 398, size: 24, fill: '#F7D3EA', weight: 400, maxChars: 24, maxLines: 2, lineGap: 34 })}
  ${bullets}
  <text x="1168" y="620" text-anchor="end" font-size="14" fill="${theme.muted}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${pageNo}/${totalPages}</text>`);
}

function renderCover(slide, theme, pageNo, totalPages) {
  if (theme.coverVariant === 'minimal') return renderCoverMinimal(slide, theme, pageNo, totalPages);
  if (theme.coverVariant === 'editorial') return renderCoverEditorial(slide, theme, pageNo, totalPages);
  if (theme.coverVariant === 'spotlight') return renderCoverSpotlight(slide, theme, pageNo, totalPages);
  if (theme.coverVariant === 'ceremony' || theme.coverVariant === 'ceremonyBlue') return renderCoverCeremony(slide, theme, pageNo, totalPages);
  if (theme.coverVariant === 'retro') return renderCoverRetro(slide, theme, pageNo, totalPages);
  return renderCoverExecutive(slide, theme, pageNo, totalPages);
}

function renderTocCards(slide, theme, pageNo, totalPages) {
  const items = slide.bodyLines.slice(0, 5).map((line, index) => {
    const x = 82 + index * 226;
    const color = index % 2 === 0 ? theme.accent : theme.accent2;
    return `
  <rect x="${x}" y="252" width="198" height="232" rx="24" fill="${theme.card}" stroke="${theme.line}" />
  <text x="${x + 22}" y="304" font-size="42" font-weight="700" fill="${color}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">0${index + 1}</text>
  ${textLines([line], { x: x + 22, y: 360, size: 20, fill: theme.ink, weight: 700, maxChars: 10, maxLines: 3, lineGap: 28 })}
  <rect x="${x + 22}" y="448" width="64" height="5" rx="2.5" fill="${color}" />`;
  }).join('');
  return shellSvg(`
  <rect width="1280" height="720" fill="${theme.bg}" />
  <rect x="0" y="0" width="1280" height="112" fill="${theme.navy}" />
  <text x="82" y="72" font-size="34" font-weight="700" fill="#FFFFFF" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.title)}</text>
  <text x="82" y="148" font-size="22" fill="${theme.muted}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.subtitle)}</text>
  ${items}
  ${pageChrome(theme, pageNo, totalPages, 'Agenda')}`);
}

function renderTocBright(slide, theme, pageNo, totalPages) {
  const items = slide.bodyLines.slice(0, 5).map((line, index) => `
  <rect x="100" y="${216 + index * 82}" width="1080" height="58" rx="18" fill="${theme.card}" stroke="${theme.line}" />
  <rect x="116" y="${228 + index * 82}" width="72" height="34" rx="17" fill="${index % 2 === 0 ? theme.accent : theme.accent2}" />
  <text x="152" y="${252 + index * 82}" text-anchor="middle" font-size="20" font-weight="700" fill="#FFFFFF" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">0${index + 1}</text>
  <text x="218" y="${253 + index * 82}" font-size="24" font-weight="700" fill="${theme.ink}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(line)}</text>`).join('');
  return shellSvg(`
  <rect width="1280" height="720" fill="${theme.bg}" />
  <rect x="0" y="0" width="1280" height="14" fill="${theme.accent}" />
  <text x="86" y="94" font-size="38" font-weight="700" fill="${theme.ink}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.title)}</text>
  <text x="88" y="140" font-size="22" fill="${theme.muted}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.subtitle)}</text>
  ${items}
  ${pageChrome(theme, pageNo, totalPages, 'Agenda')}`);
}

function renderTocSoft(slide, theme, pageNo, totalPages) {
  const items = slide.bodyLines.slice(0, 5).map((line, index) => `
  <rect x="${88 + (index % 2) * 548}" y="${226 + Math.floor(index / 2) * 152}" width="516" height="112" rx="28" fill="${theme.card}" stroke="${theme.line}" />
  <circle cx="${132 + (index % 2) * 548}" cy="${282 + Math.floor(index / 2) * 152}" r="20" fill="${index % 2 === 0 ? theme.accent : theme.accent2}" />
  <text x="${132 + (index % 2) * 548}" y="${290 + Math.floor(index / 2) * 152}" text-anchor="middle" font-size="18" font-weight="700" fill="#FFFFFF" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${index + 1}</text>
  ${textLines([line], { x: 166 + (index % 2) * 548, y: 272 + Math.floor(index / 2) * 152, size: 24, fill: theme.ink, weight: 700, maxChars: 18, maxLines: 2, lineGap: 30 })}`).join('');
  return shellSvg(`
  <rect width="1280" height="720" fill="${theme.bg}" />
  <circle cx="1120" cy="140" r="160" fill="${theme.soft}" />
  <text x="86" y="98" font-size="38" font-weight="700" fill="${theme.ink}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.title)}</text>
  <text x="88" y="146" font-size="22" fill="${theme.muted}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.subtitle)}</text>
  ${items}
  ${pageChrome(theme, pageNo, totalPages, 'Agenda')}`);
}

function renderTocDark(slide, theme, pageNo, totalPages) {
  const items = slide.bodyLines.slice(0, 5).map((line, index) => `
  <rect x="96" y="${212 + index * 84}" width="1088" height="60" rx="16" fill="${theme.card}" stroke="${theme.line}" />
  <text x="126" y="${250 + index * 84}" font-size="24" font-weight="700" fill="${index % 2 === 0 ? theme.accent : theme.accent2}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">0${index + 1}</text>
  <text x="218" y="${250 + index * 84}" font-size="24" font-weight="700" fill="${theme.ink}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(line)}</text>`).join('');
  return shellSvg(`
  <rect width="1280" height="720" fill="${theme.bg}" />
  <rect x="0" y="0" width="1280" height="128" fill="${theme.navy}" />
  <text x="86" y="82" font-size="36" font-weight="700" fill="#FFFFFF" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.title)}</text>
  <text x="88" y="166" font-size="22" fill="${theme.muted}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.subtitle)}</text>
  ${items}
  ${pageChrome(theme, pageNo, totalPages, 'Agenda')}`);
}

function renderTocRibbon(slide, theme, pageNo, totalPages) {
  const items = slide.bodyLines.slice(0, 5).map((line, index) => `
  <rect x="104" y="${220 + index * 76}" width="${930 - index * 36}" height="54" rx="10" fill="${index % 2 === 0 ? theme.accent : theme.navy}" />
  <text x="132" y="${254 + index * 76}" font-size="20" font-weight="700" fill="#FFFFFF" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">0${index + 1}</text>
  <text x="214" y="${254 + index * 76}" font-size="22" font-weight="700" fill="#FFFFFF" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(line)}</text>`).join('');
  return shellSvg(`
  <rect width="1280" height="720" fill="${theme.bg}" />
  <rect x="0" y="0" width="1280" height="16" fill="${theme.accent2}" />
  <rect x="0" y="16" width="1280" height="82" fill="${theme.navy}" />
  <text x="86" y="72" font-size="34" font-weight="700" fill="#FFFFFF" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.title)}</text>
  <text x="88" y="140" font-size="22" fill="${theme.muted}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.subtitle)}</text>
  ${items}
  ${pageChrome(theme, pageNo, totalPages, 'Agenda')}`);
}

function renderTocRetro(slide, theme, pageNo, totalPages) {
  const items = slide.bodyLines.slice(0, 5).map((line, index) => `
  <rect x="94" y="${214 + index * 80}" width="1090" height="56" fill="${theme.card}" stroke="${theme.accent2}" stroke-width="2" />
  <rect x="106" y="${226 + index * 80}" width="52" height="32" fill="${index % 2 === 0 ? theme.accent : theme.accent3}" />
  <text x="132" y="${249 + index * 80}" text-anchor="middle" font-size="18" font-weight="700" fill="${theme.navy}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${index + 1}</text>
  <text x="190" y="${250 + index * 80}" font-size="22" font-weight="700" fill="${theme.ink}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(line)}</text>`).join('');
  return shellSvg(`
  <rect width="1280" height="720" fill="${theme.bg}" />
  <rect x="78" y="74" width="1124" height="94" fill="${theme.navy}" stroke="${theme.accent}" stroke-width="3" />
  <text x="110" y="132" font-size="38" font-weight="700" fill="${theme.ink}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.title)}</text>
  <text x="96" y="190" font-size="22" fill="${theme.muted}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.subtitle)}</text>
  ${items}
  ${pageChrome(theme, pageNo, totalPages, 'Agenda')}`);
}

function renderToc(slide, theme, pageNo, totalPages) {
  if (theme.tocVariant === 'bright') return renderTocBright(slide, theme, pageNo, totalPages);
  if (theme.tocVariant === 'soft') return renderTocSoft(slide, theme, pageNo, totalPages);
  if (theme.tocVariant === 'dark') return renderTocDark(slide, theme, pageNo, totalPages);
  if (theme.tocVariant === 'ribbon') return renderTocRibbon(slide, theme, pageNo, totalPages);
  if (theme.tocVariant === 'retro') return renderTocRetro(slide, theme, pageNo, totalPages);
  return renderTocCards(slide, theme, pageNo, totalPages);
}

function renderSummary(slide, theme, pageNo, totalPages) {
  const cards = slide.bodyLines.slice(0, 4).map((line, index) => `
  <rect x="${88 + (index % 2) * 560}" y="${235 + Math.floor(index / 2) * 170}" width="512" height="128" rx="24" fill="${theme.card}" stroke="${theme.line}" />
  <circle cx="${126 + (index % 2) * 560}" cy="${280 + Math.floor(index / 2) * 170}" r="18" fill="${index % 2 === 0 ? theme.accent : theme.accent2}" />
  <text x="${126 + (index % 2) * 560}" y="${288 + Math.floor(index / 2) * 170}" text-anchor="middle" font-size="18" font-weight="700" fill="#FFFFFF" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${index + 1}</text>
  ${textLines([line], { x: 164 + (index % 2) * 560, y: 268 + Math.floor(index / 2) * 170, size: 22, fill: theme.ink, weight: 700, maxChars: 20, maxLines: 3, lineGap: 30 })}`).join('');
  return shellSvg(`
  <rect width="1280" height="720" fill="${theme.bg}" />
  <rect x="0" y="0" width="18" height="720" fill="${theme.accent}" />
  <text x="86" y="108" font-size="38" font-weight="700" fill="${theme.ink}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.title)}</text>
  <text x="88" y="154" font-size="21" fill="${theme.muted}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.subtitle)}</text>
  <rect x="88" y="184" width="180" height="6" rx="3" fill="${theme.accent}" />
  ${cards}
  ${pageChrome(theme, pageNo, totalPages, 'Executive summary')}`);
}

function renderFramework(slide, theme, pageNo, totalPages) {
  const labels = slide.bodyLines.slice(0, 4);
  const cells = labels.map((line, index) => `
  <rect x="${116 + (index % 2) * 520}" y="${230 + Math.floor(index / 2) * 180}" width="460" height="140" rx="26" fill="${index === 0 ? theme.navy : theme.card}" stroke="${theme.line}" />
  <text x="${146 + (index % 2) * 520}" y="${274 + Math.floor(index / 2) * 180}" font-size="18" fill="${index === 0 ? '#AFC2DC' : theme.muted}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">MODULE ${index + 1}</text>
  ${textLines([line], { x: 146 + (index % 2) * 520, y: 322 + Math.floor(index / 2) * 180, size: 26, fill: index === 0 ? '#FFFFFF' : theme.ink, weight: 700, maxChars: 15, maxLines: 2, lineGap: 34 })}`).join('');
  return shellSvg(`
  <rect width="1280" height="720" fill="${theme.bg}" />
  <text x="86" y="104" font-size="38" font-weight="700" fill="${theme.ink}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.title)}</text>
  <text x="88" y="148" font-size="21" fill="${theme.muted}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.subtitle)}</text>
  <line x1="636" y1="260" x2="636" y2="550" stroke="${theme.line}" stroke-width="3" />
  <line x1="250" y1="410" x2="1028" y2="410" stroke="${theme.line}" stroke-width="3" />
  ${cells}
  ${pageChrome(theme, pageNo, totalPages, 'Framework')}`);
}

function renderThreeCards(slide, theme, pageNo, totalPages) {
  const cards = slide.bodyLines.slice(0, 3).map((line, index) => `
  <rect x="${92 + index * 386}" y="260" width="326" height="250" rx="30" fill="${theme.card}" stroke="${theme.line}" />
  <rect x="${92 + index * 386}" y="260" width="326" height="10" rx="5" fill="${index === 0 ? theme.accent : index === 1 ? theme.accent2 : theme.accent3}" />
  <text x="${126 + index * 386}" y="326" font-size="44" font-weight="700" fill="${index === 0 ? theme.accent : index === 1 ? theme.accent2 : theme.accent3}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">0${index + 1}</text>
  ${textLines([line], { x: 126 + index * 386, y: 382, size: 24, fill: theme.ink, weight: 700, maxChars: 13, maxLines: 4, lineGap: 32 })}`).join('');
  return shellSvg(`
  <rect width="1280" height="720" fill="${theme.bg}" />
  <text x="88" y="104" font-size="36" font-weight="700" fill="${theme.ink}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.title)}</text>
  <text x="90" y="150" font-size="20" fill="${theme.muted}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.subtitle)}</text>
  <rect x="88" y="188" width="1104" height="2" fill="${theme.line}" />
  ${cards}
  ${pageChrome(theme, pageNo, totalPages, 'Key takeaways')}`);
}

function renderSplit(slide, theme, pageNo, totalPages) {
  const body = slide.bodyLines.slice(0, 4).map((line, index) => `
  <circle cx="760" cy="${250 + index * 76}" r="13" fill="${theme.accent}" />
  ${textLines([line], { x: 792, y: 260 + index * 76, size: 23, fill: theme.ink, weight: 700, maxChars: 22, maxLines: 2, lineGap: 30 })}`).join('');
  return shellSvg(`
  <rect width="1280" height="720" fill="${theme.bg}" />
  <rect x="0" y="0" width="522" height="720" fill="${theme.navy}" />
  <circle cx="80" cy="80" r="180" fill="${theme.accent2}" opacity="0.16" />
  <text x="84" y="126" font-size="22" fill="#AFC2DC" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">INSIGHT</text>
  ${textLines([slide.title], { x: 84, y: 206, size: 42, fill: '#FFFFFF', weight: 700, maxChars: 10, maxLines: 4, lineGap: 54 })}
  <text x="84" y="562" font-size="22" fill="#D9E6F8" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(summarizeSentence(slide.subtitle, 24))}</text>
  <text x="724" y="142" font-size="34" font-weight="700" fill="${theme.ink}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">关键论点</text>
  ${body}
  ${pageChrome(theme, pageNo, totalPages, 'Insight')}`);
}

function renderQuote(slide, theme, pageNo, totalPages) {
  const quote = slide.bodyLines[0] || slide.subtitle || slide.title;
  const support = slide.bodyLines.slice(1, 4);
  const supportLines = support.map((line, index) => `
  <rect x="${190 + index * 300}" y="500" width="240" height="84" rx="18" fill="${theme.card}" stroke="${theme.line}" />
  ${textLines([line], { x: 214 + index * 300, y: 535, size: 18, fill: theme.ink, weight: 700, maxChars: 12, maxLines: 2, lineGap: 24 })}`).join('');
  return shellSvg(`
  <rect width="1280" height="720" fill="${theme.navy}" />
  <rect x="0" y="0" width="1280" height="720" fill="#000000" opacity="0.10" />
  <circle cx="1010" cy="180" r="250" fill="${theme.accent}" opacity="0.16" />
  <text x="104" y="118" font-size="22" fill="#AFC2DC" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.title)}</text>
  <text x="104" y="222" font-size="78" font-weight="700" fill="${theme.accent}" font-family="Georgia, serif">“</text>
  ${textLines([quote], { x: 170, y: 260, size: 42, fill: '#FFFFFF', weight: 700, maxChars: 22, maxLines: 3, lineGap: 56 })}
  ${supportLines}
  <text x="1200" y="660" text-anchor="end" font-size="14" fill="#AFC2DC" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${pageNo}/${totalPages}</text>`);
}

function renderTimeline(slide, theme, pageNo, totalPages) {
  const items = slide.bodyLines.slice(0, 4).map((line, index) => `
  <circle cx="${180 + index * 290}" cy="354" r="24" fill="${index % 2 === 0 ? theme.accent : theme.accent2}" />
  <text x="${180 + index * 290}" y="362" text-anchor="middle" font-size="20" font-weight="700" fill="#FFFFFF" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${index + 1}</text>
  ${textLines([line.replace(/^阶段[一二三四]：/, '')], { x: 110 + index * 290, y: 430, size: 22, fill: theme.ink, weight: 700, maxChars: 10, maxLines: 4, lineGap: 28 })}`).join('');
  return shellSvg(`
  <rect width="1280" height="720" fill="${theme.bg}" />
  <text x="86" y="110" font-size="38" font-weight="700" fill="${theme.ink}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.title)}</text>
  <text x="88" y="156" font-size="21" fill="${theme.muted}" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.subtitle)}</text>
  <line x1="180" y1="354" x2="1050" y2="354" stroke="${theme.line}" stroke-width="6" />
  ${items}
  ${pageChrome(theme, pageNo, totalPages, 'Roadmap')}`);
}

function renderEnding(slide, theme, pageNo, totalPages) {
  const bullets = slide.bodyLines.slice(0, 3).map((line, index) => `
  <rect x="746" y="${254 + index * 102}" width="360" height="72" rx="20" fill="#FFFFFF" opacity="0.10" stroke="#FFFFFF" stroke-opacity="0.18" />
  <text x="778" y="${298 + index * 102}" font-size="21" fill="#FFFFFF" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(summarizeSentence(line, 24))}</text>`).join('');
  return shellSvg(`
  <rect width="1280" height="720" fill="${theme.navy}" />
  <circle cx="230" cy="580" r="280" fill="${theme.accent}" opacity="0.16" />
  <rect x="82" y="92" width="96" height="7" rx="3.5" fill="${theme.accent}" />
  ${textLines([slide.title], { x: 88, y: 190, size: 50, fill: '#FFFFFF', weight: 700, maxChars: 12, maxLines: 3, lineGap: 62 })}
  <text x="90" y="390" font-size="24" fill="#D9E6F8" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(slide.subtitle)}</text>
  ${bullets}
  <text x="1200" y="660" text-anchor="end" font-size="14" fill="#AFC2DC" font-family="Arial, PingFang SC, Microsoft YaHei, sans-serif">${pageNo}/${totalPages}</text>`);
}

function buildSvg(input) {
  const theme = themeFor(input.templateKey, input.templateName);
  if (input.templates?.available) {
    if (input.kind === 'cover' && input.templates.cover) return renderOfficialCover(input, theme, input.templates);
    if (input.kind === 'toc' && input.templates.toc) return renderOfficialToc(input, theme, input.templates);
    if (input.kind === 'ending' && input.templates.ending) return renderOfficialEnding(input, theme, input.templates);
    if (input.templates.content) return renderOfficialContent(input, theme, input.templates);
  }
  if (input.kind === 'cover') return renderCover(input, theme, input.pageNo, input.totalPages);
  if (input.kind === 'toc') return renderToc(input, theme, input.pageNo, input.totalPages);
  if (input.kind === 'summary') return renderSummary(input, theme, input.pageNo, input.totalPages);
  if (input.kind === 'framework') return renderFramework(input, theme, input.pageNo, input.totalPages);
  if (input.kind === 'three_cards') return renderThreeCards(input, theme, input.pageNo, input.totalPages);
  if (input.kind === 'split') return renderSplit(input, theme, input.pageNo, input.totalPages);
  if (input.kind === 'quote') return renderQuote(input, theme, input.pageNo, input.totalPages);
  if (input.kind === 'timeline') return renderTimeline(input, theme, input.pageNo, input.totalPages);
  return renderEnding(input, theme, input.pageNo, input.totalPages);
}

async function main() {
  const projectPath = process.argv[2];
  const projectName = process.argv[3] || 'Untitled Project';
  const prompt = process.argv[4] || '自动生成的高端演示文稿';
  const audience = process.argv[5] || '';
  const templateName = process.argv[6] || 'Template';
  const markdownPath = process.argv[7] || '';
  const outlinePath = process.argv[8] || '';
  const pagesLabel = process.argv[9] || '10-12 页';
  const templateKey = process.argv[10] || templateName;

  if (!projectPath) {
    throw new Error('Usage: node generate-mvp-svg.cjs <projectPath> <projectName> <prompt> <audience> <templateName> [markdownPath] [outlinePath] [pagesLabel] [templateKey]');
  }

  const svgFinalDir = path.join(projectPath, 'svg_final');
  await fs.mkdir(svgFinalDir, { recursive: true });
  const oldFiles = await fs.readdir(svgFinalDir).catch(() => []);
  await Promise.all(oldFiles.filter((name) => name.endsWith('.svg')).map((name) => fs.unlink(path.join(svgFinalDir, name)).catch(() => {})));

  const markdown = await readIfExists(markdownPath);
  const outline = await readIfExists(outlinePath);
  const sections = parseMarkdownSections(markdown || outline);
  const lead = extractDocumentLead(markdown, projectName);
  const templates = await loadProjectTemplates(projectPath);
  const tocItems = buildTocItems(sections, sections.map((section) => section.title));
  const slides = buildDeckPlan({ projectName, templateName, prompt, audience, sections, pagesLabel, lead });
  const totalPages = slides.length;

  for (const [index, slide] of slides.entries()) {
    const filename = `${slugNumber(index)}_${slide.kind}.svg`;
    const svg = buildSvg({
      ...slide,
      filename,
      pageNo: slugNumber(index),
      totalPages,
      templateName,
      templateKey,
      projectName,
      audience,
      templates,
      tocItems,
      sectionNum: String(Math.max(1, index)).padStart(2, '0'),
      sectionName: slide.title,
    });
    await fs.writeFile(path.join(svgFinalDir, filename), svg, 'utf8');
  }

  console.log(`Generated ${slides.length} SVG pages in ${svgFinalDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
