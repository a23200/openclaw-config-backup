const http = require('node:http');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const host = '127.0.0.1';
const port = Number(process.env.APP_FACTORY_PORT || 4321);
const root = path.join(__dirname, '..', 'src', 'app-factory');
const indexPath = path.join(root, 'index.html');
const runtimeRoot = path.join(__dirname, '..', 'runtime', 'app-factory');
const projectsRoot = path.join(runtimeRoot, 'projects');
const dataFilePath = path.join(runtimeRoot, 'projects.json');
const workspaceRoot = path.resolve(__dirname, '..', '..');
const pptMasterRoot = process.env.PPT_MASTER_ROOT || path.join(workspaceRoot, 'ppt-master');
const pptSkillDir = path.join(pptMasterRoot, 'skills', 'ppt-master');
const pptPython = process.env.PPT_MASTER_PYTHON || path.join(pptMasterRoot, '.venv', 'bin', 'python');
const localSvgGeneratorScript = path.join(__dirname, 'generate-mvp-svg.cjs');
const projectManagerScript = path.join(pptSkillDir, 'scripts', 'project_manager.py');
const docToMdScript = path.join(pptSkillDir, 'scripts', 'source_to_md', 'doc_to_md.py');
const svgToPptxScript = path.join(pptSkillDir, 'scripts', 'svg_to_pptx.py');

const templateCatalog = {
  exhibit: { name: 'Exhibit', category: 'strategy' },
  mckinsey: { name: 'McKinsey', category: 'strategy' },
  google_style: { name: 'Google Style', category: 'technology' },
  anthropic: { name: 'Anthropic', category: 'technology' },
  ai_ops: { name: 'Enterprise Digital Intelligence', category: 'government' },
  government_red: { name: 'Government Red', category: 'government' },
  government_blue: { name: 'Government Blue', category: 'government' },
  招商银行: { name: '招商银行', category: 'finance' },
  科技蓝商务: { name: '科技蓝商务', category: 'general_business' },
  smart_red: { name: 'Smart Red', category: 'general_business' },
  academic_defense: { name: 'Academic Defense', category: 'academic' },
  medical_university: { name: 'Medical University', category: 'medical' },
  psychology_attachment: { name: 'Psychology Healing', category: 'scenario' },
  pixel_retro: { name: 'Pixel Retro', category: 'creative' },
  中国电建_现代: { name: '中国电建·现代', category: 'enterprise' },
  中汽研_现代: { name: '中汽研·现代', category: 'enterprise' },
};

async function ensureRuntime() {
  await fsp.mkdir(projectsRoot, { recursive: true });
  try {
    await fsp.access(dataFilePath);
  } catch {
    await fsp.writeFile(dataFilePath, JSON.stringify({ projects: [] }, null, 2), 'utf8');
  }
}

async function readProjects() {
  await ensureRuntime();
  const raw = await fsp.readFile(dataFilePath, 'utf8');
  const data = JSON.parse(raw);
  return Array.isArray(data.projects) ? data.projects : [];
}

async function writeProjects(projects) {
  await ensureRuntime();
  await fsp.writeFile(dataFilePath, JSON.stringify({ projects }, null, 2), 'utf8');
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function collectBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > 1024 * 1024 * 25) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function collectJson(req) {
  const buffer = await collectBuffer(req);
  return buffer.length ? JSON.parse(buffer.toString('utf8')) : {};
}

function parseMultipart(req, buffer) {
  const contentType = req.headers['content-type'] || '';
  const match = contentType.match(/boundary=(.+)$/);
  if (!match) {
    throw new Error('Missing multipart boundary');
  }
  const boundary = `--${match[1]}`;
  const text = buffer.toString('latin1');
  const rawParts = text.split(boundary).slice(1, -1);
  const fields = {};
  const files = [];

  for (const rawPart of rawParts) {
    const trimmed = rawPart.replace(/^\r\n/, '').replace(/\r\n$/, '');
    const separatorIndex = trimmed.indexOf('\r\n\r\n');
    if (separatorIndex === -1) continue;
    const rawHeaders = trimmed.slice(0, separatorIndex);
    const rawBody = trimmed.slice(separatorIndex + 4);
    const headers = rawHeaders.split('\r\n');
    const disposition = headers.find((line) => line.toLowerCase().startsWith('content-disposition:')) || '';
    const nameMatch = disposition.match(/name="([^"]+)"/);
    if (!nameMatch) continue;
    const fieldName = nameMatch[1];
    const filenameMatch = disposition.match(/filename="([^"]*)"/);
    if (filenameMatch) {
      const typeLine = headers.find((line) => line.toLowerCase().startsWith('content-type:')) || '';
      const mimeType = typeLine.split(':').slice(1).join(':').trim() || 'application/octet-stream';
      files.push({
        fieldName,
        filename: filenameMatch[1],
        mimeType,
        buffer: Buffer.from(rawBody, 'latin1'),
      });
    } else {
      fields[fieldName] = Buffer.from(rawBody, 'latin1').toString('utf8').trim();
    }
  }

  return { fields, files };
}

function slugify(input) {
  return String(input || 'project')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';
}

function inferMarkdownPath(sourcePath) {
  const parsed = path.parse(sourcePath);
  return path.join(parsed.dir, `${parsed.name}.md`);
}

async function runBestEffort(command, args, options = {}) {
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd || process.cwd(),
      timeout: options.timeout || 120_000,
      maxBuffer: 1024 * 1024 * 8,
      env: { ...process.env, ...(options.env || {}) },
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function extractCreatedProjectPath(stdout, fallbackDir, projectName) {
  const match = String(stdout || '').match(/Project created:\s*(.+)/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return path.join(fallbackDir, projectName);
}

function buildOutline(markdownSummary) {
  const intro = markdownSummary || '根据上传文档自动提取的摘要将在此显示。';
  return [
    '# 自动生成 PPT 大纲',
    '',
    '## 1. 封面',
    '- 项目标题',
    '- 副标题 / 核心结论',
    '',
    '## 2. 执行摘要',
    '- 问题定义',
    '- 核心机会',
    '',
    '## 3. 内容拆解',
    `- ${intro}`,
    '',
    '## 4. 解决方案 / 方案建议',
    '- 关键策略点',
    '- 实施路径',
    '',
    '## 5. 结尾页',
    '- 总结与行动建议',
  ].join('\n');
}

function buildDesignSpecMarkdown(brief) {
  const createdDate = new Date(brief.createdAt).toISOString().slice(0, 10);
  const templateName = brief.templateName || brief.templateKey || 'Free Design';
  const audience = brief.audience || '未指定受众';
  const pages = brief.pages || '8-10 页';
  const tone = brief.tone || '高端商务';
  const prompt = brief.prompt || '标题结论化表达，版式高级，少字强视觉。';

  return [
    `# ${brief.projectName} - Design Spec`,
    '',
    '> Auto-generated by App Factory. This file follows the PPT Master handoff contract and can be manually refined before final SVG generation.',
    '',
    '## I. Project Information',
    '',
    '| Item | Value |',
    '| ---- | ----- |',
    `| **Project Name** | ${brief.projectName} |`,
    '| **Canvas Format** | PPT 16:9 (1280×720) |',
    `| **Page Count** | ${pages} |`,
    `| **Design Style** | ${templateName} / ${tone} |`,
    `| **Target Audience** | ${audience} |`,
    '| **Use Case** | Word document to premium editable PowerPoint |',
    `| **Created Date** | ${createdDate} |`,
    '',
    '---',
    '',
    '## IX. Content Outline',
    '',
    '#### Slide 01 - Cover',
    `- **Title**: ${brief.projectName}`,
    `- **Subtitle**: ${prompt}`,
    '',
    '#### Slide 02 - Executive Summary',
    '- **Layout**: 3 insight cards',
    '- **Content**: summarize document into 3 conclusion-first takeaways',
    '',
    '#### Slide 03-10 - Main Content',
    '- **Layout**: split, cards, matrix, timeline depending on chapter content',
    '- **Content**: derived from document sections and bullets',
    '',
    '#### Slide Final - Closing',
    '- **Layout**: big statement + next action',
    '- **Content**: final conclusion and call to action',
    '',
    '## XI. Execution Constraints',
    '',
    '- Output editable SVG pages first, then export native PowerPoint shapes.',
    '- Do not render the entire slide as a flat bitmap.',
    '- Preserve selected template style and PPT 16:9 canvas.',
  ].join('\n');
}

function normalizeUploadPayload(payload) {
  if (payload.binaryFile) {
    return {
      projectName: payload.projectName,
      templateKey: payload.templateKey,
      fileName: payload.binaryFile.filename,
      fileType: payload.binaryFile.mimeType,
      fileBuffer: payload.binaryFile.buffer,
      audience: payload.audience || '',
      pages: payload.pages || '8-10 页',
      tone: payload.tone || '高端商务',
      prompt: payload.prompt || '',
      summary: payload.summary || payload.prompt || payload.projectName,
    };
  }
  return {
    ...payload,
    fileBuffer: payload.fileContent ? Buffer.from(String(payload.fileContent), 'utf8') : Buffer.alloc(0),
  };
}

async function createPptMasterProject(brief, projectSlug) {
  const runs = [];
  const pptProjectsDir = path.join(runtimeRoot, 'ppt-master-projects');
  await fsp.mkdir(pptProjectsDir, { recursive: true });

  const initName = `${projectSlug}-${brief.id.slice(0, 8)}`;

  const initRun = await runBestEffort(pptPython, [projectManagerScript, 'init', initName, '--format', 'ppt169', '--dir', pptProjectsDir], {
    cwd: pptMasterRoot,
  });
  runs.push({ step: 'ppt-master:init', ...initRun });

  const pptProjectPath = extractCreatedProjectPath(initRun.stdout, pptProjectsDir, initName);

  const sourceImportRun = await runBestEffort(pptPython, [projectManagerScript, 'import-sources', pptProjectPath, brief.sourcePath], {
    cwd: pptMasterRoot,
  });
  runs.push({ step: 'ppt-master:import-source', ...sourceImportRun });

  const pptDesignSpecPath = path.join(pptProjectPath, 'design_spec.md');
  await fsp.writeFile(pptDesignSpecPath, buildDesignSpecMarkdown(brief), 'utf8');
  runs.push({ step: 'ppt-master:write-design-spec', ok: true, stdout: `Wrote ${pptDesignSpecPath}`, stderr: '' });

  const templateSourceDir = path.join(pptSkillDir, 'templates', 'layouts', brief.templateKey);
  const templateCopyRun = await runBestEffort('bash', ['-lc', 'if [ -d "$1" ]; then cp "$1"/*.svg "$2"/templates/ 2>/dev/null || true; cp "$1"/design_spec.md "$2"/templates/ 2>/dev/null || true; cp "$1"/*.png "$2"/images/ 2>/dev/null || true; cp "$1"/*.jpg "$2"/images/ 2>/dev/null || true; fi', 'bash', templateSourceDir, pptProjectPath], {
    cwd: pptMasterRoot,
  });
  runs.push({ step: 'ppt-master:copy-template-assets', ...templateCopyRun, templateSourceDir });

  const markdownPath = inferMarkdownPath(brief.sourcePath);
  const isDocx = /\.docx?$/i.test(brief.sourcePath);
  const convertRun = isDocx
    ? await runBestEffort(pptPython, [docToMdScript, brief.sourcePath, '-o', markdownPath], { cwd: pptMasterRoot })
    : await runBestEffort('bash', ['-lc', 'cp "$1" "$2"', 'bash', brief.sourcePath, markdownPath], { cwd: pptMasterRoot });
  runs.push({ step: 'ppt-master:doc-to-md', ...convertRun, markdownPath });

  if (convertRun.ok) {
    const mdImportRun = await runBestEffort(pptPython, [projectManagerScript, 'import-sources', pptProjectPath, markdownPath], {
      cwd: pptMasterRoot,
    });
    runs.push({ step: 'ppt-master:import-markdown', ...mdImportRun });
  }

  const validateRun = await runBestEffort(pptPython, [projectManagerScript, 'validate', pptProjectPath], {
    cwd: pptMasterRoot,
  });
  runs.push({ step: 'ppt-master:validate', ...validateRun });

  const svgGenerationRun = await runBestEffort('node', [localSvgGeneratorScript, pptProjectPath, brief.projectName, brief.prompt, brief.audience, brief.templateName, convertRun.ok ? markdownPath : '', brief.outlinePath, brief.pages], {
    cwd: path.dirname(localSvgGeneratorScript),
  });
  runs.push({ step: 'app-factory:generate-dynamic-svg', ...svgGenerationRun });

  const exportRun = await runBestEffort(pptPython, [svgToPptxScript, pptProjectPath, '-s', 'final'], {
    cwd: pptMasterRoot,
  });
  runs.push({ step: 'ppt-master:export-pptx', ...exportRun });

  return {
    pptMasterRoot,
    pptSkillDir,
    pptPython,
    pptProjectPath,
    pptDesignSpecPath,
    markdownPath: convertRun.ok ? markdownPath : '',
    runs,
  };
}

async function writeProjectHandoff(project, pptMaster) {
  const handoffPath = path.join(project.projectDir, 'PROJECT_RESULT.md');
  const lines = [
    `# ${project.projectName} · App Factory Result`,
    '',
    `- 状态：${project.status}`,
    `- 上传文件：${project.fileName}`,
    `- 模板：${project.templateName}`,
    `- 页数目标：${project.pages}`,
    `- ppt-master 项目：${pptMaster.pptProjectPath}`,
    `- Markdown：${pptMaster.markdownPath || '未生成'}`,
    '',
    '## Pipeline Summary',
    ...pptMaster.runs.map((run) => `- ${run.step}: ${run.ok ? 'ok' : 'failed'}`),
  ];
  await fsp.writeFile(handoffPath, lines.join('\n'), 'utf8');
  return handoffPath;
}

async function createProject(rawPayload) {
  const payload = normalizeUploadPayload(rawPayload);
  const now = new Date().toISOString();
  const id = randomUUID();
  const projectSlug = slugify(payload.projectName || payload.fileName || `ppt-${Date.now()}`);
  const projectDir = path.join(projectsRoot, `${projectSlug}-${id.slice(0, 8)}`);
  await fsp.mkdir(projectDir, { recursive: true });
  await fsp.mkdir(path.join(projectDir, 'sources'), { recursive: true });
  await fsp.mkdir(path.join(projectDir, 'exports'), { recursive: true });

  const sourcePath = path.join(projectDir, 'sources', payload.fileName || 'source.docx');
  const outlinePath = path.join(projectDir, 'outline.md');
  const designSpecPath = path.join(projectDir, 'design-spec.json');
  const exportPptxPath = path.join(projectDir, 'exports', `${projectSlug}.pptx`);
  const exportSvgPptxPath = path.join(projectDir, 'exports', `${projectSlug}_svg.pptx`);

  await fsp.writeFile(sourcePath, payload.fileBuffer || Buffer.alloc(0));
  await fsp.writeFile(outlinePath, buildOutline(payload.summary || payload.projectName), 'utf8');
  await fsp.writeFile(
    designSpecPath,
    JSON.stringify(
      {
        canvas: 'ppt169',
        pageRange: payload.pages || '8-10 页',
        audience: payload.audience || '',
        style: payload.tone || '高端商务',
        template: templateCatalog[payload.templateKey]?.name || payload.templateKey,
        prompt: payload.prompt || '',
      },
      null,
      2,
    ),
    'utf8',
  );

  const brief = {
    id,
    createdAt: now,
    updatedAt: now,
    status: 'ready_for_pipeline',
    projectName: payload.projectName,
    fileName: payload.fileName,
    fileType: payload.fileType || 'application/octet-stream',
    templateKey: payload.templateKey,
    templateName: templateCatalog[payload.templateKey]?.name || payload.templateKey,
    audience: payload.audience || '',
    pages: payload.pages || '8-10 页',
    tone: payload.tone || '高端商务',
    prompt: payload.prompt || '',
    projectDir,
    sourcePath,
    outlinePath,
    designSpecPath,
    exportPptxPath,
    exportSvgPptxPath,
  };

  const pptMaster = await createPptMasterProject(brief, projectSlug);
  const pipelineRunsPath = path.join(projectDir, 'ppt-master-runs.json');
  await fsp.writeFile(pipelineRunsPath, JSON.stringify(pptMaster.runs, null, 2), 'utf8');

  brief.pptMasterRoot = pptMaster.pptMasterRoot;
  brief.pptSkillDir = pptMaster.pptSkillDir;
  brief.pptPython = pptMaster.pptPython;
  brief.pptMasterProjectPath = pptMaster.pptProjectPath;
  brief.pptMasterDesignSpecPath = pptMaster.pptDesignSpecPath;
  brief.markdownPath = pptMaster.markdownPath;
  brief.pipelineRunsPath = pipelineRunsPath;
  brief.status = pptMaster.runs.every((run) => run.ok) ? 'ppt_master_project_ready' : 'ppt_master_project_partial';
  brief.resultDocPath = await writeProjectHandoff(brief, pptMaster);

  const projects = await readProjects();
  projects.unshift(brief);
  await writeProjects(projects);
  return brief;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${host}:${port}`);

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = await fsp.readFile(indexPath, 'utf8');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/templates') {
      sendJson(res, 200, { templates: templateCatalog });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/projects') {
      const projects = await readProjects();
      sendJson(res, 200, { projects });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/projects') {
      let payload;
      const contentType = req.headers['content-type'] || '';
      if (contentType.startsWith('multipart/form-data')) {
        const buffer = await collectBuffer(req);
        const multipart = parseMultipart(req, buffer);
        const binaryFile = multipart.files.find((file) => file.fieldName === 'sourceFile');
        payload = {
          ...multipart.fields,
          binaryFile,
        };
      } else {
        payload = await collectJson(req);
      }
      if (!payload.projectName || !payload.templateKey || !(payload.fileName || payload.binaryFile?.filename)) {
        sendJson(res, 400, { error: 'projectName, templateKey, fileName/sourceFile are required' });
        return;
      }
      const project = await createProject(payload);
      sendJson(res, 201, { project });
      return;
    }

    sendJson(res, 404, { error: 'Not Found' });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : 'Unknown server error' });
  }
});

ensureRuntime()
  .then(() => {
    server.listen(port, host, () => {
      console.log(`[app-factory] http://${host}:${port}`);
    });
  })
  .catch((error) => {
    console.error('[app-factory] failed to start', error);
    process.exit(1);
  });
