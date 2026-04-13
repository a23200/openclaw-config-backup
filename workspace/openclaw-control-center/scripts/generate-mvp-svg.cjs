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

function slugNumber(index) {
  return String(index + 1).padStart(2, '0');
}

function wrapText(text, maxCharsPerLine = 28, maxLines = 4) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  if (!source) return [''];
  const lines = [];
  let cursor = 0;
  while (cursor < source.length && lines.length < maxLines) {
    lines.push(source.slice(cursor, cursor + maxCharsPerLine));
    cursor += maxCharsPerLine;
  }
  return lines;
}

function summarizeSentence(text, max = 72) {
  const source = String(text || '').replace(/[#>*`\-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!source) return '';
  return source.length > max ? `${source.slice(0, max - 1)}…` : source;
}

async function readIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function parseMarkdownSections(markdown) {
  const raw = String(markdown || '');
  const lines = raw.split(/\r?\n/);
  const sections = [];
  let current = null;

  const pushCurrent = () => {
    if (!current) return;
    current.body = current.body
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 12);
    if (!current.title && current.body[0]) {
      current.title = summarizeSentence(current.body[0], 24);
      current.body = current.body.slice(1);
    }
    if (current.title || current.body.length) {
      sections.push(current);
    }
  };

  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.+)/);
    if (heading) {
      pushCurrent();
      current = { title: summarizeSentence(heading[1], 32), body: [] };
      continue;
    }
    if (!current) {
      current = { title: '', body: [] };
    }
    const cleaned = line
      .replace(/^[-*+]\s+/, '')
      .replace(/^\d+[.)]\s+/, '')
      .trim();
    if (cleaned) {
      current.body.push(summarizeSentence(cleaned, 88));
    }
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

function buildDeckPlan({ projectName, templateName, prompt, audience, sections, pagesLabel }) {
  const targetPages = inferPageTarget(pagesLabel);
  const cleanSections = sections.length
    ? sections
    : [{ title: '项目背景', body: [prompt || '从上传文档中提取核心信息并形成高端演示稿。'] }];

  const intro = cleanSections[0];
  const highlights = cleanSections.slice(0, 3).map((section) => section.title || section.body[0] || '核心要点');
  const slides = [];

  slides.push({
    kind: 'cover',
    title: projectName,
    subtitle: `${templateName} · ${audience || '面向核心决策者'}`,
    bodyLines: [
      summarizeSentence(prompt || '根据真实文档自动生成的高端商务演示文稿', 64),
      `内容来源：${cleanSections.length} 个结构化章节`,
      '输出：原生可编辑 PPTX',
    ],
  });

  slides.push({
    kind: 'toc',
    title: '目录与核心逻辑',
    subtitle: '从源文档自动抽取得到的主线结构',
    bodyLines: highlights.map((item, index) => `${index + 1}. ${item}`),
  });

  slides.push({
    kind: 'summary',
    title: '执行摘要',
    subtitle: intro.title || '结论先行',
    bodyLines: (intro.body.length ? intro.body : highlights).slice(0, 4),
  });

  const contentSlides = [];
  for (const section of cleanSections) {
    if (contentSlides.length >= 8) break;
    const chunks = [];
    const body = section.body.length ? section.body : [section.title || '内容待补充'];
    for (let index = 0; index < body.length; index += 4) {
      chunks.push(body.slice(index, index + 4));
    }
    if (!chunks.length) chunks.push([section.title || '内容待补充']);
    for (const chunk of chunks) {
      contentSlides.push({
        kind: 'content',
        title: section.title || '核心内容',
        subtitle: summarizeSentence(chunk[0] || prompt || '自动生成内容页', 40),
        bodyLines: chunk,
      });
      if (contentSlides.length >= 8) break;
    }
  }

  const contentTarget = Math.max(5, Math.min(9, targetPages - 3));
  while (contentSlides.length < contentTarget) {
    const seed = cleanSections[contentSlides.length % cleanSections.length] || intro;
    contentSlides.push({
      kind: 'content',
      title: seed.title || '重点展开',
      subtitle: '根据源文档自动补足的内容页',
      bodyLines: (seed.body.length ? seed.body : highlights).slice(0, 4),
    });
  }

  slides.push(...contentSlides.slice(0, contentTarget));

  slides.push({
    kind: 'ending',
    title: '结论与下一步',
    subtitle: '自动生成建议行动',
    bodyLines: [
      `建议围绕「${highlights[0] || '核心议题'}」优先推进。`,
      '将本次文档中的关键结论转化为汇报与执行清单。',
      '如需更高完成度，可继续补图表、数据和品牌素材。',
    ],
  });

  return slides.slice(0, 12);
}

function paletteFor(kind) {
  const map = {
    cover: { accent: '#7C9CFF', bg: '#07111F' },
    toc: { accent: '#34D399', bg: '#0B1526' },
    summary: { accent: '#F59E0B', bg: '#0D1729' },
    content: { accent: '#67E8F9', bg: '#08111F' },
    ending: { accent: '#A78BFA', bg: '#07111F' },
  };
  return map[kind] || map.content;
}

function buildSvg({ title, subtitle, bodyLines, accent, bg, filename, pageNo, totalPages }) {
  const subtitleLines = wrapText(subtitle, 34, 3);
  const body = bodyLines.slice(0, 5).map((line, index) => `
    <text x="84" y="${270 + index * 58}" font-size="28" fill="#D9E2F2" font-family="Arial, PingFang SC, sans-serif">${escapeXml(line)}</text>`).join('');
  const subtitleBlock = subtitleLines.map((line, index) => `
    <text x="84" y="${172 + index * 34}" font-size="22" fill="#98A7C2" font-family="Arial, PingFang SC, sans-serif">${escapeXml(line)}</text>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="accentGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${accent}" />
      <stop offset="100%" stop-color="#67E8F9" />
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="${bg}" />
  <circle cx="1120" cy="110" r="160" fill="${accent}" opacity="0.10" />
  <circle cx="1180" cy="620" r="220" fill="#FFFFFF" opacity="0.04" />
  <rect x="70" y="64" width="7" height="104" rx="3.5" fill="url(#accentGradient)" />
  <text x="84" y="112" font-size="44" font-weight="700" fill="#F4F7FB" font-family="Arial, PingFang SC, sans-serif">${escapeXml(title)}</text>${subtitleBlock}
  <rect x="74" y="238" width="1132" height="328" rx="28" fill="#101C31" stroke="#FFFFFF" stroke-opacity="0.08" />${body}
  <text x="84" y="640" font-size="18" fill="#7F90AE" font-family="Arial, PingFang SC, sans-serif">Generated by App Factory · ${escapeXml(filename)}</text>
  <text x="1178" y="640" text-anchor="end" font-size="18" fill="#7F90AE" font-family="Arial, PingFang SC, sans-serif">${pageNo}/${totalPages}</text>
</svg>`;
}

async function main() {
  const projectPath = process.argv[2];
  const projectName = process.argv[3] || 'Untitled Project';
  const prompt = process.argv[4] || '自动生成的高端演示文稿';
  const audience = process.argv[5] || '目标受众';
  const templateName = process.argv[6] || 'Template';
  const markdownPath = process.argv[7] || '';
  const outlinePath = process.argv[8] || '';
  const pagesLabel = process.argv[9] || '10-12 页';

  if (!projectPath) {
    throw new Error('Usage: node generate-mvp-svg.cjs <projectPath> <projectName> <prompt> <audience> <templateName> [markdownPath] [outlinePath] [pagesLabel]');
  }

  const svgFinalDir = path.join(projectPath, 'svg_final');
  await fs.mkdir(svgFinalDir, { recursive: true });

  const markdown = await readIfExists(markdownPath);
  const outline = await readIfExists(outlinePath);
  const sections = parseMarkdownSections(markdown || outline);
  const slides = buildDeckPlan({ projectName, templateName, prompt, audience, sections, pagesLabel });
  const totalPages = slides.length;

  for (const [index, slide] of slides.entries()) {
    const filename = `${slugNumber(index)}_${slide.kind}.svg`;
    const palette = paletteFor(slide.kind);
    const svg = buildSvg({
      ...slide,
      ...palette,
      filename,
      pageNo: slugNumber(index),
      totalPages,
    });
    await fs.writeFile(path.join(svgFinalDir, filename), svg, 'utf8');
  }

  console.log(`Generated ${slides.length} SVG pages in ${svgFinalDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
