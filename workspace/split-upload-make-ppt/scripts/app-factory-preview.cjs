const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { buildPromptSource, estimateUtf8Bytes, trimForPrompt } = require('./lib/app-factory-prompt.cjs');

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(__dirname, '..');

applyEnvFile(path.join(repoRoot, '.env'));
applyEnvFile(path.join(repoRoot, '.env.local'));

const host = '127.0.0.1';
const port = Number(process.env.APP_FACTORY_PORT || 4321);
const root = path.join(__dirname, '..', 'src', 'app-factory');
const indexPath = path.join(root, 'index.html');
const runtimeRoot = path.join(__dirname, '..', 'runtime', 'app-factory');
const projectsRoot = path.join(runtimeRoot, 'projects');
const dataFilePath = path.join(runtimeRoot, 'projects.json');
let projectsMutationQueue = Promise.resolve();
const homeDir = process.env.HOME || '';
const fallbackPptMasterRoot = path.join(homeDir, '.openclaw', 'workspace', 'ppt-master');
const pptMasterRoot = resolveExistingPath(
  [
    process.env.PPT_MASTER_ROOT,
    fallbackPptMasterRoot,
    path.join(repoRoot, '..', 'ppt-master'),
    path.join(repoRoot, 'ppt-master'),
  ],
  process.env.PPT_MASTER_ROOT || fallbackPptMasterRoot,
);
const pptSkillDir = path.join(pptMasterRoot, 'skills', 'ppt-master');
const pptPython = resolveExistingPath(
  [
    process.env.PPT_MASTER_PYTHON,
    path.join(pptMasterRoot, '.venv', 'bin', 'python'),
  ],
  process.env.PPT_MASTER_PYTHON || path.join(pptMasterRoot, '.venv', 'bin', 'python'),
);
const repoPython = resolveExistingPath(
  [
    process.env.MAKE_PPT_PYTHON,
    path.join(repoRoot, '.venv', 'bin', 'python'),
    process.env.PYTHON,
    'python3',
  ],
  process.env.MAKE_PPT_PYTHON || path.join(repoRoot, '.venv', 'bin', 'python'),
);
const localSvgGeneratorScript = path.join(__dirname, 'generate-mvp-svg.cjs');
const comicPptScript = path.join(__dirname, 'build_comic_manga_ppt.py');
const projectManagerScript = path.join(pptSkillDir, 'scripts', 'project_manager.py');
const docToMdScript = path.join(pptSkillDir, 'scripts', 'source_to_md', 'doc_to_md.py');
const pdfToMdScript = path.join(pptSkillDir, 'scripts', 'source_to_md', 'pdf_to_md.py');
const svgToPptxScript = path.join(pptSkillDir, 'scripts', 'svg_to_pptx.py');

const plusAiApiKey = String(process.env.PLUS_AI_API_KEY || process.env.PLUSAI_API_KEY || '').trim();
const plusAiApiBaseUrl = String(process.env.PLUS_AI_API_BASE_URL || 'https://api.plusdocs.com/r/v0').replace(/\/+$/, '');
const plusAiPollTimeoutMs = Number(process.env.PLUS_AI_POLL_TIMEOUT_MS || 8 * 60 * 1000);
const plusAiPollIntervalMs = Number(process.env.PLUS_AI_POLL_INTERVAL_MS || 5 * 1000);
const plusAiSourceMaxChars = readPositiveInt(process.env.PLUS_AI_SOURCE_MAX_CHARS, 18_000);
const plusAiSourceMinChars = readPositiveInt(process.env.PLUS_AI_SOURCE_MIN_CHARS, 3_500);
const plusAiExtraPromptMaxChars = readPositiveInt(process.env.PLUS_AI_EXTRA_PROMPT_MAX_CHARS, 800);
const plusAiTargetRequestBytes = readPositiveInt(process.env.PLUS_AI_TARGET_REQUEST_BYTES, 32 * 1024);

const sharedWorkflowTemplates = {
  comic_manga_ppt: {
    name: 'Comic Manga PPT',
    displayName: '漫画风 PPT',
    category: 'comic',
    summary: '参考图 + Gemini 真生图，中文字直接融合进画面，按文档内容自动定页',
    color: '蓝橙漫画叙事',
    style: '商业漫画 / 图文融合 / 动态页数',
    workflow: 'comic_manga',
    progressHint: '解析文档 → 规划分镜 → 逐页生图 → 打包 PPT',
    engineLabel: 'Gemini 漫画生图',
  },
};

const localTemplateCatalog = {
  ...sharedWorkflowTemplates,
  exhibit: { name: 'Exhibit', category: 'strategy', summary: 'Exhibit takeaway 条带风格，数据驱动，权威感强' },
  mckinsey: { name: 'McKinsey', category: 'strategy', summary: '适合战略咨询、投融资分析、经营复盘' },
  google_style: { name: 'Google Style', category: 'technology', summary: '适合年报、产品分享、技术布道' },
  anthropic: { name: 'Anthropic', category: 'technology', summary: '适合 AI/LLM 知识分享、技术路线介绍' },
  ai_ops: { name: 'Enterprise Digital Intelligence', category: 'government', summary: '适合 AI 运维、数字化转型、系统架构图' },
  government_red: { name: 'Government Red', category: 'government', summary: '适合党委党建、政府报告、专项汇报' },
  government_blue: { name: 'Government Blue', category: 'government', summary: '适合智慧城市、数字政府、治理平台' },
  招商银行: { name: '招商银行', category: 'finance', summary: '适合银行产品推介、培训、交易银行方案' },
  科技蓝商务: { name: '科技蓝商务', category: 'general_business', summary: '适合企业方案、SaaS、科技解决方案' },
  smart_red: { name: 'Smart Red', category: 'general_business', summary: '适合教育、科技企业介绍、增长型业务' },
  academic_defense: { name: 'Academic Defense', category: 'academic', summary: '适合毕业答辩、研究汇报、项目申报' },
  medical_university: { name: 'Medical University', category: 'medical', summary: '适合病例讨论、医学汇报、医院科研' },
  psychology_attachment: { name: 'Psychology Healing', category: 'scenario', summary: '适合心理咨询培训、依恋主题、疗愈课程' },
  pixel_retro: { name: 'Pixel Retro', category: 'creative', summary: '适合 Git、技术分享、游戏化主题' },
  中国电建_现代: { name: '中国电建·现代', category: 'enterprise', summary: '适合工程项目、出海业务、重大建设汇报' },
  中汽研_现代: { name: '中汽研·现代', category: 'enterprise', summary: '适合认证、汽车科技、前沿技术展示' },
};

const localTemplateCategories = {
  strategy: '战略咨询',
  technology: '科技 AI',
  government: '政企政务',
  finance: '金融',
  general_business: '通用商务',
  academic: '学术答辩',
  medical: '医疗',
  scenario: '垂直场景',
  creative: '创意风格',
  comic: '漫画叙事',
  enterprise: '品牌企业',
};

function plusAiTemplateAsset(pathname) {
  return `https://plusai.com${pathname}`;
}

const plusAiTemplateCatalog = {
  ...sharedWorkflowTemplates,
  aurora: {
    name: 'Aurora',
    displayName: '极光渐变创意',
    category: 'creative',
    templateId: 'EPX9O042Z6Sv6iQzbuARhS',
    thumbnailUrl: plusAiTemplateAsset('/62375700635d76646ef2457f/6733982571b94f3670d1e6b7_Aurora.png'),
    summary: '更具视觉氛围感，适合创新提案和品牌提案',
    color: '渐变色彩',
    style: '视觉优先、创意表达',
  },
  blackboard: {
    name: 'Blackboard',
    displayName: '黑板培训课堂',
    category: 'dark',
    templateId: 'ZudB2GVFiv1KzcgdRsbfM8',
    summary: '黑板质感模板，适合课堂感、培训和创意说明',
    color: '粉笔黑板风',
    style: '手写感、课堂感',
  },
  brut_brick: {
    name: 'Brut Brick',
    displayName: '砖红强视觉版式',
    category: 'brutalist',
    templateId: 'p8pxA5qoot1I2WffVbQFaj',
    thumbnailUrl: plusAiTemplateAsset('/62375700635d76646ef2457f/67339f08de8cb1a5cfe11f39_Brut%20Brick%20(5)%20(1).png'),
    summary: '强烈砖红对比，适合先锋提案和品牌表达',
    color: '砖红 + 高对比',
    style: '粗野主义、视觉冲击',
  },
  brut_seascape: {
    name: 'Brut Seascape',
    displayName: '海蓝强视觉版式',
    category: 'brutalist',
    templateId: 'QBtFc6rV16vJpMoiX6vb8l',
    thumbnailUrl: plusAiTemplateAsset('/62375700635d76646ef2457f/6733a1750b9af47baf2bff1f_Brut%20Seascape%20(1).png'),
    summary: '海洋色粗野风，适合创意提案和设计表达',
    color: '深蓝海洋色',
    style: '粗野主义、版面张力强',
  },
  brut_tigris: {
    name: 'Brut Tigris',
    displayName: '复古拼贴强视觉',
    category: 'brutalist',
    templateId: 'kOqAdCKG7xojGCT4ZfXSK4',
    thumbnailUrl: plusAiTemplateAsset('/62375700635d76646ef2457f/6733a49f3903bc7136d00d22_Brut%20Tigris%20(1).png'),
    summary: '暗色先锋风，适合大胆视觉和叙事型汇报',
    color: '深色粗野风',
    style: '实验感、创意强',
  },
  composition_book: {
    name: 'Composition Book',
    displayName: '作文本培训讲义',
    category: 'notebook',
    templateId: 'ZudB2GVFiv1KzcgdRz9FC6',
    summary: '作文本质感，适合课程、培训、教育主题',
    color: '纸质笔记本风',
    style: '文档感、学习感',
  },
  corporate_blue: {
    name: 'Corporate Blue',
    displayName: '企业蓝商务汇报',
    category: 'professional',
    templateId: 'XFzedsfTQ3ccCtO09ZWSav',
    summary: '标准企业蓝，适合商务方案、售前和企业介绍',
    color: '企业蓝',
    style: '稳妥耐看、客户汇报友好',
  },
  editorial: {
    name: 'Editorial',
    displayName: '杂志风品牌画册',
    category: 'creative',
    templateId: 'p8pxA5qoot1I2WffVcrm2D',
    thumbnailUrl: plusAiTemplateAsset('/62375700635d76646ef2457f/65fb6886b163bff045be8af3_Editorial%20(57).png'),
    summary: '更偏杂志感排版，适合品牌故事、案例展示',
    color: '编辑风黑白灰',
    style: '版式感强、适合讲故事',
  },
  feemo: {
    name: 'Feemo',
    displayName: '轻活力产品发布',
    category: 'creative',
    templateId: 'OjeLTqC7loN3OmaqHD0qby',
    summary: '轻松活泼，适合产品介绍和年轻化品牌内容',
    color: '轻快配色',
    style: '灵动、亲和',
  },
  forest_floor: {
    name: 'Forest Floor',
    displayName: '森系 ESG 汇报',
    category: 'nature',
    templateId: 'kOqAdCKG7xojGCT4ZfbYAV',
    thumbnailUrl: plusAiTemplateAsset('/62375700635d76646ef2457f/65fb66de7056b8df4ef79f0e_Forest%20Floor%20(1).png'),
    summary: '自然绿色系，适合 ESG、可持续、乡村文旅等主题',
    color: '森林绿',
    style: '自然、有机、舒缓',
  },
  fred: {
    name: 'Fred',
    displayName: '复古运动活力',
    category: 'creative',
    templateId: 'N12Yg407RXsoVq9xji1jA9',
    thumbnailUrl: plusAiTemplateAsset('/62375700635d76646ef2457f/6733a7bc211cd4ca41e2cb00_Fred.png'),
    summary: '偏趣味和创意，适合脑暴、轻量发布和活动方案',
    color: '明快多彩',
    style: '轻松、有趣',
  },
  herbert: {
    name: 'Herbert',
    displayName: '几何插画创意',
    category: 'creative',
    templateId: 'N12Yg407RXsoVq9xjoYtXV',
    thumbnailUrl: plusAiTemplateAsset('/62375700635d76646ef2457f/6733aac541a63018dcc58b10_GS%20Herbert.png'),
    summary: '创意插画感更强，适合品牌故事和概念方案',
    color: '创意彩色',
    style: '插画感、叙事型',
  },
  indigo: {
    name: 'Indigo',
    displayName: '靛青复古简约',
    category: 'modern',
    templateId: 'p8pxA5qoot1I2WffVd69nF',
    thumbnailUrl: plusAiTemplateAsset('/62375700635d76646ef2457f/6733be04bd39291bc57ce7e8_Indigo%20(7)%20(1).png'),
    summary: '靛青现代风，适合科技产品、内部分享和数据说明',
    color: '靛青色',
    style: '现代、清爽',
  },
  insight: {
    name: 'Insight',
    displayName: '深蓝咨询汇报',
    category: 'consulting',
    templateId: 'iG190W6PEa3wEoxBjE7gtz',
    thumbnailUrl: plusAiTemplateAsset('/62375700635d76646ef2457f/68278d0506d09a6c49011f7a_Insight.png'),
    summary: '咨询汇报风，适合战略、经营分析、投融资',
    color: '商务蓝 + 强对比标题',
    style: '结论先行、咨询感强',
  },
  insight_bold: {
    name: 'Insight Bold',
    displayName: '红黑咨询强对比',
    category: 'consulting',
    templateId: 'D9fCV9f59UZFiLIMMzUMhy',
    thumbnailUrl: plusAiTemplateAsset('/62375700635d76646ef2457f/682792ad7cac61a39a876a85_PPT%20Insight%20Bold%20(1).png'),
    summary: '更强视觉冲击的咨询风，适合关键结论页',
    color: '高对比商务色',
    style: '封面抓眼、管理层沟通',
  },
  insight_modern: {
    name: 'Insight Modern',
    displayName: '现代咨询科技风',
    category: 'consulting',
    templateId: 'D9fCV9f59UZFiLIMLoUj3k',
    summary: '现代咨询风，适合科技公司、增长业务、产品战略',
    color: '现代蓝灰',
    style: '咨询结构 + 科技简洁',
  },
  kin: {
    name: 'Kin',
    displayName: '生活方式品牌',
    category: 'modern',
    templateId: 'N12Yg407RXsoVq9xjozV7a',
    thumbnailUrl: plusAiTemplateAsset('/62375700635d76646ef2457f/6733c08847111c0ce6d6d28a_Kin.png'),
    summary: '温和现代风，适合团队介绍、组织文化和培训材料',
    color: '柔和现代色',
    style: '轻松现代、亲和',
  },
  mallorca: {
    name: 'Mallorca',
    displayName: '明快复古商务',
    category: 'professional',
    templateId: 'kqplMC1wKwvcjVhxZGoAQa',
    thumbnailUrl: plusAiTemplateAsset('/62375700635d76646ef2457f/65fb64ad896a5f71847422d3_Mallorca%20(1).png'),
    summary: '明亮专业风，适合项目说明、品牌提案和通用商务',
    color: '明亮商务色',
    style: '现代专业、视觉舒展',
  },
  manila: {
    name: 'Manila',
    displayName: '暖黄通用商务',
    category: 'professional',
    templateId: 'nXmZO8Fk1P14FXUEQFD78H',
    thumbnailUrl: plusAiTemplateAsset('/62375700635d76646ef2457f/6733c4445dfb834342269cd2_Manila.png'),
    summary: '简洁暖色商务风，适合企业介绍、方案汇报和培训',
    color: '暖色商务',
    style: '稳定、友好',
  },
  metro: {
    name: 'Metro',
    displayName: '都会彩色商务',
    category: 'professional',
    templateId: 'kqplMC1wKwvcjVhxZGqBaa',
    thumbnailUrl: plusAiTemplateAsset('/62375700635d76646ef2457f/6733c638d60fdd621c137bb9_Metro%20(8)%20(1).png'),
    summary: '商务现代风，适合项目汇报和流程型内容',
    color: '现代商务',
    style: '稳健、清晰、流程页友好',
  },
  minimalist_light: {
    name: 'Minimalist Light',
    displayName: '极简白商务',
    category: 'modern',
    templateId: 'XFzedsfTQ3ccCtO09a4pZt',
    thumbnailUrl: plusAiTemplateAsset('/62375700635d76646ef2457f/6733ea715b18a5bbd618ac93_Minimalist%20Light%20(4)%20(1).png'),
    summary: '浅色极简，适合内容清晰、品牌克制的科技材料',
    color: '白底极简',
    style: '留白多、现代感强',
  },
  modern_sketchpad: {
    name: 'Modern Sketchpad',
    displayName: '手绘速写方案',
    category: 'notebook',
    templateId: 'OjeLTqC7loN3OmaqHMjIIF',
    thumbnailUrl: plusAiTemplateAsset('/62375700635d76646ef2457f/682796073771996321438335_41ebc6e006c6859e282c57c747579f4f94445b67-960x540.jpg'),
    summary: '现代手绘本风，适合创意策划和概念讲解',
    color: '手绘草图风',
    style: '创意草图、轻松表达',
  },
  modernist_professional: {
    name: 'Modernist Professional',
    displayName: '现代专业商务',
    category: 'professional',
    templateId: 'kqplMC1wKwvcjVhxZGz9ia',
    thumbnailUrl: plusAiTemplateAsset('/62375700635d76646ef2457f/65fb6077d1c8b5c1e6aac168_Modernist%20Professional%20(5).png'),
    summary: '专业商务、干净克制，适合正式汇报与管理层材料',
    color: '灰白底 + 深色标题',
    style: '高级商务、稳重、留白充足',
  },
  modernist_siena: {
    name: 'Modernist Siena',
    displayName: '暖棕高定商务',
    category: 'professional',
    templateId: 'XFzedsfTQ3ccCtO09aA7vY',
    thumbnailUrl: plusAiTemplateAsset('/62375700635d76646ef2457f/6733cc1a1c93966ba73f05d1_Modernist%20Siena%20(5).png'),
    summary: '暖调现代商务，适合品牌战略和高层沟通材料',
    color: '暖灰 + 棕调',
    style: '高级、稳重、品牌感',
  },
  plus_default: {
    name: 'Plus Default',
    displayName: 'Plus 默认商务',
    category: 'professional',
    templateId: 'd1e65e54-753c-4368-946b-ddb430583b0d',
    summary: 'Plus AI 官方默认模板，适合通用商务场景',
    color: '通用商务蓝',
    style: '稳妥默认、兼容性高',
  },
  potpourri: {
    name: 'Potpourri',
    displayName: '多彩营销创意',
    category: 'creative',
    templateId: '1jelx0KVU9F6jq1WcIQDsD',
    summary: '更自由的创意排版，适合品牌故事、营销和活动提案',
    color: '多彩创意',
    style: '自由、视觉丰富',
  },
  simple_notebook: {
    name: 'Simple Notebook',
    displayName: '简约笔记讲义',
    category: 'notebook',
    templateId: 'nXmZO8Fk1P14FXUEQFFZEp',
    thumbnailUrl: plusAiTemplateAsset('/62375700635d76646ef2457f/6733e862368bdea8ddb0e407_PPT%20Simple%20Notebook%20(2).png'),
    summary: '简单笔记本风，适合培训讲义和内部分享',
    color: '纸质笔记风',
    style: '轻量、教学型',
  },
  spiral_notebook: {
    name: 'Spiral Notebook',
    displayName: '线圈手账培训',
    category: 'notebook',
    templateId: 'N12Yg407RXsoVq9xk7LMTR',
    thumbnailUrl: plusAiTemplateAsset('/62375700635d76646ef2457f/6733e9d372ccd82324f8f55c_Spiral%20Notebook.png'),
    summary: '线圈本风格，适合 workshop、课程和团队共创',
    color: '笔记本纸感',
    style: '工作坊、学习型',
  },
  swiss_dark: {
    name: 'Swiss Dark',
    displayName: '瑞士深色科技',
    category: 'dark',
    templateId: 'XFzedsfTQ3ccCtO09aCCgD',
    thumbnailUrl: plusAiTemplateAsset('/62375700635d76646ef2457f/65fb59f4321f35ca4e7b46db_Swiss%20Dark.png'),
    summary: '深色高级感，适合发布会、AI、数据产品方案',
    color: '深色底 + 高对比文本',
    style: '高级、科技、舞台感',
  },
  swiss_light: {
    name: 'Swiss Light',
    displayName: '瑞士浅色极简',
    category: 'modern',
    templateId: 'kqplMC1wKwvcjVhxZHI0qO',
    thumbnailUrl: plusAiTemplateAsset('/62375700635d76646ef2457f/65fb587a70ccd0b5df92028f_Swiss%20Bright.png'),
    summary: '轻量现代，适合产品介绍、培训和内部分享',
    color: '浅色现代',
    style: '国际化、简洁',
  },
};

const plusAiTemplateCategories = {
  professional: '商务通用',
  consulting: '咨询汇报',
  modern: '极简现代',
  dark: '深色科技',
  creative: '品牌创意',
  comic: '漫画叙事',
  brutalist: '强视觉',
  notebook: '培训讲义',
  nature: 'ESG 自然',
};

const providerCatalog = {
  ppt_master: {
    key: 'ppt_master',
    label: 'PPT Master',
    templates: localTemplateCatalog,
    categories: localTemplateCategories,
    defaultTemplateKey: 'comic_manga_ppt',
  },
  plus_ai: {
    key: 'plus_ai',
    label: 'Plus AI',
    templates: plusAiTemplateCatalog,
    categories: plusAiTemplateCategories,
    defaultTemplateKey: 'comic_manga_ppt',
  },
};

const activeProviderKey = plusAiApiKey ? 'plus_ai' : 'ppt_master';
const activeProvider = providerCatalog[activeProviderKey];
const templateCatalog = activeProvider.templates;

function getTemplateMeta(providerKey, templateKey) {
  const requestedProvider = providerCatalog[providerKey] || activeProvider;
  if (requestedProvider?.templates?.[templateKey]) {
    return requestedProvider.templates[templateKey];
  }
  for (const provider of Object.values(providerCatalog)) {
    if (provider.templates?.[templateKey]) {
      return provider.templates[templateKey];
    }
  }
  return {};
}

function resolveTemplateRuntime(providerKey, templateKey) {
  const requestedProvider = selectProvider(providerKey);
  const templateMeta = getTemplateMeta(requestedProvider.key, templateKey);
  const workflow = templateMeta.workflow || 'standard';
  if (workflow === 'comic_manga') {
    return {
      providerKey: 'comic_gemini',
      providerLabel: templateMeta.engineLabel || 'Gemini 漫画生图',
      workflow,
      requestedProvider,
      templateMeta,
    };
  }
  return {
    providerKey: requestedProvider.key,
    providerLabel: requestedProvider.label,
    workflow,
    requestedProvider,
    templateMeta,
  };
}

function applyEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    if (!key || process.env[key]) continue;
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function resolveExistingPath(candidates, fallback) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return fallback;
}

async function ensureRuntime() {
  await fsp.mkdir(projectsRoot, { recursive: true });
  try {
    await fsp.access(dataFilePath);
  } catch {
    await fsp.writeFile(dataFilePath, JSON.stringify({ projects: [] }, null, 2), 'utf8');
  }
}

async function waitForProjectMutations() {
  try {
    await projectsMutationQueue;
  } catch {}
}

function parseProjectsPayload(raw) {
  const source = String(raw || '').trim();
  if (!source) {
    return { data: { projects: [] }, repaired: false };
  }
  try {
    return { data: JSON.parse(source), repaired: false };
  } catch {}

  for (let index = source.length - 1; index >= 0; index -= 1) {
    if (source[index] !== '}') continue;
    const candidate = source.slice(0, index + 1);
    try {
      return { data: JSON.parse(candidate), repaired: true, repairedRaw: candidate };
    } catch {}
  }
  return { data: { projects: [] }, repaired: true, repairedRaw: JSON.stringify({ projects: [] }, null, 2) };
}

async function readProjectsFileNoWait() {
  await ensureRuntime();
  const raw = await fsp.readFile(dataFilePath, 'utf8');
  const parsed = parseProjectsPayload(raw);
  const data = parsed.data || { projects: [] };
  if (parsed.repaired) {
    const backupPath = path.join(runtimeRoot, `projects.corrupt-${Date.now()}.json`);
    await fsp.writeFile(backupPath, raw, 'utf8').catch(() => {});
    await fsp.writeFile(dataFilePath, JSON.stringify(data, null, 2), 'utf8');
  }
  return Array.isArray(data.projects) ? data.projects : [];
}

async function readProjects() {
  await waitForProjectMutations();
  return readProjectsFileNoWait();
}

async function writeProjects(projects) {
  await ensureRuntime();
  await fsp.writeFile(dataFilePath, JSON.stringify({ projects }, null, 2), 'utf8');
}

function buildProjectProgress(stage, message, percent, extra = {}) {
  return {
    stage,
    message,
    percent: clamp(Math.round(percent), 0, 100),
    updatedAt: new Date().toISOString(),
    ...extra,
  };
}

function buildProjectLogEntry(kind, title, body, extra = {}) {
  return {
    id: randomUUID(),
    kind: kind || 'info',
    title: String(title || '运行日志'),
    body: String(body || '').trim(),
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

function trimProjectLogs(logs, maxEntries = 80) {
  const normalized = Array.isArray(logs) ? logs.filter(Boolean) : [];
  return normalized.slice(-maxEntries);
}

async function upsertProject(project) {
  const mutation = async () => {
    const projects = await readProjectsFileNoWait();
    const nextProject = {
      ...project,
      liveLogs: trimProjectLogs(project.liveLogs),
      updatedAt: new Date().toISOString(),
    };
    const index = projects.findIndex((item) => item.id === nextProject.id);
    if (index >= 0) {
      projects[index] = nextProject;
    } else {
      projects.unshift(nextProject);
    }
    await writeProjects(projects);
    return nextProject;
  };
  const pending = projectsMutationQueue.then(mutation, mutation);
  projectsMutationQueue = pending.then(() => undefined, () => undefined);
  return pending;
}

async function patchProject(projectId, patch) {
  const mutation = async () => {
    const projects = await readProjectsFileNoWait();
    const index = projects.findIndex((item) => item.id === projectId);
    if (index === -1) return null;
    const previous = projects[index];
    const nextPatch = typeof patch === 'function' ? patch(previous) : patch;
    const nextProject = {
      ...previous,
      ...nextPatch,
      liveLogs: trimProjectLogs(nextPatch?.liveLogs ?? previous.liveLogs),
      updatedAt: new Date().toISOString(),
    };
    projects[index] = nextProject;
    await writeProjects(projects);
    return nextProject;
  };
  const pending = projectsMutationQueue.then(mutation, mutation);
  projectsMutationQueue = pending.then(() => undefined, () => undefined);
  return pending;
}

async function readProject(projectId) {
  const projects = await readProjects();
  return projects.find((item) => item.id === projectId) || null;
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
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) {
    throw new Error('Missing multipart boundary');
  }
  const boundary = `--${match[1] || match[2]}`;
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
    const filenameStarMatch = disposition.match(/filename\*=([^;]+)/i);
    const filenameMatch = disposition.match(/filename="([^"]*)"/);
    if (filenameMatch) {
      const typeLine = headers.find((line) => line.toLowerCase().startsWith('content-type:')) || '';
      const mimeType = typeLine.split(':').slice(1).join(':').trim() || 'application/octet-stream';
      files.push({
        fieldName,
        filename: decodeMultipartFilename(filenameStarMatch ? filenameStarMatch[1] : filenameMatch[1]),
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

function decodeMultipartFilename(rawValue) {
  const source = String(rawValue || '').trim();
  if (!source) return 'upload.bin';
  const rfc5987 = source.match(/^(?:[A-Za-z0-9!#$&+\-.^_`|~]+)?''(.+)$/);
  if (rfc5987) {
    try {
      return decodeURIComponent(rfc5987[1]);
    } catch {
      return rfc5987[1];
    }
  }
  const normalized = source.replace(/^"(.*)"$/, '$1');
  const decoded = Buffer.from(normalized, 'latin1').toString('utf8');
  return decoded.includes('�') ? normalized : decoded;
}

function inferMarkdownPath(sourcePath) {
  const parsed = path.parse(sourcePath);
  return path.join(parsed.dir, `${parsed.name}.md`);
}

function inferJsonPath(sourcePath, suffix) {
  const parsed = path.parse(sourcePath);
  return path.join(parsed.dir, `${parsed.name}.${suffix}.json`);
}

function selectProvider(providerKey) {
  if (providerKey === 'plus_ai' && !plusAiApiKey) {
    return activeProvider;
  }
  return providerCatalog[providerKey] || activeProvider;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function readPositiveInt(input, fallback) {
  const parsed = Number.parseInt(String(input || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseRequestedSlideCount(label) {
  const text = String(label || '').trim();
  const rangeMatch = text.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[2]);
    return clamp(Math.round((min + max) / 2), 6, 30);
  }
  const singleMatch = text.match(/(\d+)/);
  if (singleMatch) {
    return clamp(Number(singleMatch[1]), 6, 30);
  }
  return 10;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callProgress(reportProgress, stage, message, percent, extra = {}) {
  if (typeof reportProgress === 'function') {
    await reportProgress(stage, message, percent, extra);
  }
}

async function callLog(reportLog, kind, title, body, extra = {}) {
  if (typeof reportLog === 'function') {
    await reportLog(kind, title, body, extra);
  }
}

function buildSourceBudgets(maxChars, minChars) {
  const budgets = [];
  let current = Math.max(minChars, maxChars);
  while (current >= minChars) {
    budgets.push(current);
    if (current === minChars) break;
    const next = Math.max(minChars, Math.floor(current * 0.72));
    if (next === current) break;
    current = next;
  }
  return [...new Set(budgets)];
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
  const templateName = brief.templateDisplayName || brief.templateName || brief.templateKey || 'Free Design';
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
      provider: payload.provider,
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

async function prepareSourceMaterial(brief, reportProgress, reportLog) {
  const runs = [];
  const sourceExt = path.extname(brief.sourcePath).toLowerCase();
  const sourceAlreadyMarkdown = sourceExt === '.md' || sourceExt === '.markdown';
  const sourceIsPdf = sourceExt === '.pdf';
  const sourceIsPlainText = sourceExt === '.txt';
  const markdownPath = sourceAlreadyMarkdown ? brief.sourcePath : inferMarkdownPath(brief.sourcePath);
  let convertRun = skippedRun('source conversion unavailable');

  await callProgress(reportProgress, 'prepare_markdown', '正在把文档转成 Markdown', 12);
  await callLog(reportLog, 'analysis', '开始分析文档', `收到文件《${brief.fileName || '源文档'}》，准备提取正文结构与关键章节。`);

  if (sourceAlreadyMarkdown) {
    convertRun = successRun(`Source already Markdown: ${markdownPath}`);
  } else if (sourceIsPlainText) {
    await fsp.copyFile(brief.sourcePath, markdownPath);
    convertRun = successRun(`Copied plain text source to Markdown: ${markdownPath}`);
  } else if (sourceIsPdf) {
    convertRun = await runBestEffort(pptPython, [pdfToMdScript, brief.sourcePath, '-o', markdownPath], { cwd: pptMasterRoot });
  } else {
    convertRun = await runBestEffort(pptPython, [docToMdScript, brief.sourcePath, '-o', markdownPath], { cwd: pptMasterRoot });
  }

  runs.push({ step: 'content:prepare-markdown', ...convertRun, markdownPath });
  const markdownText = convertRun.ok ? await fsp.readFile(markdownPath, 'utf8') : '';
  if (convertRun.ok) {
    await callProgress(reportProgress, 'prepare_markdown', '源文档已解析完成', 24);
    await callLog(
      reportLog,
      'analysis',
      '文档解析完成',
      `已生成 Markdown，共 ${markdownText.length} 个字符，后续开始提取页面结构与设计方向。`,
      { markdownPath },
    );
  }

  return {
    runs,
    markdownPath: convertRun.ok ? markdownPath : '',
    markdownText,
    convertRun,
  };
}

function buildPlusAiPrompt(brief, sourceText, sourceMode) {
  const requestedSlides = parseRequestedSlideCount(brief.pages);
  const templateName = brief.templateOfficialName || brief.templateName || brief.templateKey || 'Modernist Professional';
  const audience = brief.audience || '老板 / 管理层 / 客户';
  const tone = brief.tone || '高端商务';
  const extraPrompt = brief.prompt ? `\n额外要求：${brief.prompt}` : '';
  const sourceLead = sourceMode === 'digest'
    ? '以下是源文档压缩摘要（自动提炼，保留标题、要点、数字与时间，不是全文）：'
    : sourceMode === 'trimmed'
      ? '以下是源文档节选（原文过长，已截短）：'
      : '以下是源文档内容：';

  return [
    `请用中文生成一份 ${requestedSlides} 页左右的 PowerPoint。`,
    `主题：${brief.projectName}`,
    `目标受众：${audience}`,
    `风格目标：${tone}`,
    `模板偏好：${templateName}`,
    '',
    '必须遵守：',
    '- 第一页必须是正常封面，不要把正文错误放到第一页。',
    '- 标题使用结论先行表达，避免空泛标题。',
    '- 每页信息密度中高，但不要堆字；优先使用要点、对比、流程、时间线、表格。',
    '- 整体要像正式商务汇报，不要像学生作业或随意排版。',
    '- 最后一页输出总结与下一步建议。',
    '- 尽量保留原文关键事实、数字、时间和结构。',
    extraPrompt,
    '',
    sourceLead,
    sourceText,
  ].filter(Boolean).join('\n');
}

function buildPlusAiRequestPayload(brief, markdownText) {
  const template = templateCatalog[brief.templateKey] || {};
  const normalizedPrompt = trimForPrompt(brief.prompt, plusAiExtraPromptMaxChars);
  const sourceBudgets = buildSourceBudgets(plusAiSourceMaxChars, plusAiSourceMinChars);
  let bestAttempt = null;

  for (const sourceBudget of sourceBudgets) {
    const source = buildPromptSource(markdownText, {
      maxChars: sourceBudget,
      preferFullChars: Math.min(sourceBudget, 6_000),
    });
    const requestBody = {
      prompt: buildPlusAiPrompt({ ...brief, prompt: normalizedPrompt }, source.text, source.mode),
      numberOfSlides: parseRequestedSlideCount(brief.pages),
      language: 'zh',
      textHandling: 'PRESERVE',
      includeUserTips: false,
    };
    if (template.templateId) {
      requestBody.templateId = template.templateId;
    }

    const requestBytes = estimateUtf8Bytes(JSON.stringify(requestBody));
    bestAttempt = {
      requestBody,
      requestBytes,
      sourceMode: source.mode,
      sourceChars: source.text.length,
      sourceBytes: source.bytes,
    };
    if (requestBytes <= plusAiTargetRequestBytes) {
      break;
    }
  }

  return bestAttempt;
}

async function fetchJsonWithTimeout(url, options = {}) {
  const timeoutMs = options.timeoutMs || 60_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs);
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body,
      signal: controller.signal,
    });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    return { response, data, text };
  } finally {
    clearTimeout(timer);
  }
}

async function createPlusAiRequest(requestBody) {
  const url = `${plusAiApiBaseUrl}/presentation`;
  let attempt = 0;
  let lastError = null;

  while (attempt < 3) {
    attempt += 1;
    let response;
    let data;
    let text;
    try {
      ({ response, data, text } = await fetchJsonWithTimeout(url, {
        method: 'POST',
        timeoutMs: 90_000,
        headers: {
          Authorization: `Bearer ${plusAiApiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }));
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < 3) {
        await sleep(2000 * attempt);
        continue;
      }
      break;
    }

    if (response.ok) {
      return { ok: true, data };
    }

    const retryAfterSeconds = Number(response.headers.get('retry-after') || 0);
    lastError = new Error(`Plus AI create failed (${response.status}): ${data?.error || data?.message || text || 'Unknown error'}`);
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      await sleep((retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 2000 * attempt));
      continue;
    }
    break;
  }

  return { ok: false, error: lastError || new Error('Plus AI create failed') };
}

function resolvePlusAiPollingUrl(pollingUrl, requestId) {
  if (pollingUrl) {
    return String(pollingUrl).startsWith('http')
      ? String(pollingUrl)
      : `${plusAiApiBaseUrl.replace(/\/+$/, '')}/${String(pollingUrl).replace(/^\/+/, '')}`;
  }
  if (requestId) {
    return `${plusAiApiBaseUrl}/presentation/${encodeURIComponent(String(requestId))}`;
  }
  return '';
}

async function pollPlusAiPresentation(pollingUrl) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < plusAiPollTimeoutMs) {
    let response;
    let data;
    let text;
    try {
      ({ response, data, text } = await fetchJsonWithTimeout(pollingUrl, {
        headers: {
          Authorization: `Bearer ${plusAiApiKey}`,
        },
      }));
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        error: new Error(`Plus AI polling failed (${response.status}): ${data?.error || data?.message || text || 'Unknown error'}`),
      };
    }

    const status = String(data?.status || '').toUpperCase();
    if (status === 'GENERATED') {
      return { ok: true, data };
    }
    if (status === 'FAILED') {
      return {
        ok: false,
        error: new Error(data?.error || data?.message || 'Plus AI generation failed'),
        data,
      };
    }

    await sleep(plusAiPollIntervalMs);
  }

  return {
    ok: false,
    error: new Error(`Plus AI polling timed out after ${Math.round(plusAiPollTimeoutMs / 1000)} seconds`),
  };
}

async function downloadBinaryFile(fileUrl, outputPath) {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  await fsp.writeFile(outputPath, Buffer.from(arrayBuffer));
}

function buildOutlineFromPlusAi(slides) {
  if (!Array.isArray(slides) || !slides.length) return '';
  const lines = ['# Plus AI 自动生成大纲', ''];
  slides.forEach((slide, index) => {
    const title = String(slide?.title || slide?.heading || `第 ${index + 1} 页`).trim();
    lines.push(`## ${String(index + 1).padStart(2, '0')}. ${title}`);
    const bullets = Array.isArray(slide?.bullets)
      ? slide.bullets
      : Array.isArray(slide?.points)
        ? slide.points
        : [];
    bullets.slice(0, 6).forEach((bullet) => {
      if (typeof bullet === 'string' && bullet.trim()) {
        lines.push(`- ${bullet.trim()}`);
      }
    });
    lines.push('');
  });
  return lines.join('\n');
}

async function createPlusAiProject(brief, projectSlug, reportProgress, reportLog) {
  const runs = [];
  const sourceMaterial = await prepareSourceMaterial(brief, reportProgress, reportLog);
  runs.push(...sourceMaterial.runs);

  if (!sourceMaterial.convertRun.ok || !sourceMaterial.markdownText.trim()) {
    runs.push({
      step: 'plus-ai:prepare-input',
      ...skippedRun('无法从源文档提取可用文本，Plus AI 生成已跳过'),
    });
    return {
      provider: 'plus_ai',
      providerLabel: providerCatalog.plus_ai.label,
      markdownPath: sourceMaterial.markdownPath,
      exportPptxPath: '',
      runs,
    };
  }

  await callProgress(reportProgress, 'prepare_request', '正在压缩正文并准备生成请求', 36);
  await callLog(reportLog, 'design', '生成思路', `当前走 ${providerCatalog.plus_ai.label} 模板链路，先提炼正文，再生成正式商务版式。`);
  const requestPayload = buildPlusAiRequestPayload(brief, sourceMaterial.markdownText);
  runs.push({
    step: 'plus-ai:fit-request',
    ok: Boolean(requestPayload?.requestBody),
    stdout: requestPayload ? JSON.stringify({
      requestBytes: requestPayload.requestBytes,
      targetBytes: plusAiTargetRequestBytes,
      sourceMode: requestPayload.sourceMode,
      sourceChars: requestPayload.sourceChars,
      sourceBytes: requestPayload.sourceBytes,
    }, null, 2) : '',
    stderr: requestPayload?.requestBody ? '' : 'Failed to build Plus AI request payload',
    error: requestPayload?.requestBody ? '' : 'Failed to build Plus AI request payload',
  });
  if (!requestPayload?.requestBody) {
    return {
      provider: 'plus_ai',
      providerLabel: providerCatalog.plus_ai.label,
      markdownPath: sourceMaterial.markdownPath,
      exportPptxPath: '',
      runs,
    };
  }

  await callProgress(reportProgress, 'generate_slides', '已提交 Plus AI，正在生成版式', 56);
  await callLog(reportLog, 'design', '已提交版式生成', `目标模板：${brief.templateDisplayName || brief.templateName}；目标页数：${brief.pages}。`);
  const createResult = await createPlusAiRequest(requestPayload.requestBody);
  runs.push({
    step: 'plus-ai:create-presentation',
    ok: createResult.ok,
    stdout: createResult.ok ? JSON.stringify({
      id: createResult.data?.id || '',
      status: createResult.data?.status || '',
      pollingUrl: createResult.data?.pollingUrl || '',
    }, null, 2) : '',
    stderr: createResult.ok ? '' : String(createResult.error?.message || 'Plus AI create failed'),
    error: createResult.ok ? '' : String(createResult.error?.message || 'Plus AI create failed'),
  });
  if (!createResult.ok) {
    return {
      provider: 'plus_ai',
      providerLabel: providerCatalog.plus_ai.label,
      markdownPath: sourceMaterial.markdownPath,
      exportPptxPath: '',
      runs,
    };
  }

  const pollingUrl = resolvePlusAiPollingUrl(createResult.data?.pollingUrl, createResult.data?.id);
  await callProgress(reportProgress, 'generate_slides', 'Plus AI 正在生成 PPT，请稍候', 72);
  await callLog(reportLog, 'progress', '等待引擎返回', '已收到外部任务 ID，持续轮询生成状态。');
  const pollResult = await pollPlusAiPresentation(pollingUrl);
  runs.push({
    step: 'plus-ai:poll-presentation',
    ok: pollResult.ok,
    stdout: pollResult.ok ? JSON.stringify({
      id: pollResult.data?.id || createResult.data?.id || '',
      status: pollResult.data?.status || '',
      url: pollResult.data?.url || '',
    }, null, 2) : '',
    stderr: pollResult.ok ? '' : String(pollResult.error?.message || 'Plus AI polling failed'),
    error: pollResult.ok ? '' : String(pollResult.error?.message || 'Plus AI polling failed'),
  });
  if (!pollResult.ok) {
    return {
      provider: 'plus_ai',
      providerLabel: providerCatalog.plus_ai.label,
      markdownPath: sourceMaterial.markdownPath,
      exportPptxPath: '',
      runs,
    };
  }

  const metadataPath = inferJsonPath(path.join(brief.projectDir, projectSlug), 'plus-ai');
  await fsp.writeFile(metadataPath, JSON.stringify(pollResult.data, null, 2), 'utf8');

  const generatedOutline = buildOutlineFromPlusAi(pollResult.data?.slides);
  if (generatedOutline) {
    await fsp.writeFile(brief.outlinePath, generatedOutline, 'utf8');
  }

  try {
    await callProgress(reportProgress, 'download_ppt', '正在下载生成好的 PPT', 92);
    await callLog(reportLog, 'progress', '开始下载成品', '版式生成完成，正在下载最终 PPT 文件。');
    await downloadBinaryFile(pollResult.data?.url, brief.exportPptxPath);
    runs.push({
      step: 'plus-ai:download-pptx',
      ...successRun(`Downloaded Plus AI PPTX to ${brief.exportPptxPath}`),
    });
  } catch (error) {
    runs.push({
      step: 'plus-ai:download-pptx',
      ...skippedRun(error instanceof Error ? error.message : String(error)),
    });
  }

  return {
    provider: 'plus_ai',
    providerLabel: providerCatalog.plus_ai.label,
    markdownPath: sourceMaterial.markdownPath,
    exportPptxPath: await pathExists(brief.exportPptxPath) ? brief.exportPptxPath : '',
    outlinePath: await pathExists(brief.outlinePath) ? brief.outlinePath : '',
    metadataPath,
    externalId: pollResult.data?.id || createResult.data?.id || '',
    promptSourceMode: requestPayload.sourceMode,
    requestBytes: requestPayload.requestBytes,
    runs,
  };
}

async function createPptMasterProject(brief, projectSlug, reportProgress, reportLog) {
  const runs = [];
  const pptProjectsDir = path.join(runtimeRoot, 'ppt-master-projects');
  await fsp.mkdir(pptProjectsDir, { recursive: true });

  const initName = `${projectSlug}-${brief.id.slice(0, 8)}`;
  await callProgress(reportProgress, 'build_project', '正在初始化 PPT Master 项目', 18);
  await callLog(reportLog, 'design', '初始化设计工程', `当前走 PPT Master 链路，模板为 ${brief.templateDisplayName || brief.templateName}。`);

  const initRun = await runBestEffort(pptPython, [projectManagerScript, 'init', initName, '--format', 'ppt169', '--dir', pptProjectsDir], {
    cwd: pptMasterRoot,
  });
  runs.push({ step: 'ppt-master:init', ...initRun });

  const pptProjectPath = extractCreatedProjectPath(initRun.stdout, pptProjectsDir, initName);
  await ensurePptProjectSkeleton(pptProjectPath);

  const sourceImportRun = initRun.ok
    ? await runBestEffort(pptPython, [projectManagerScript, 'import-sources', pptProjectPath, brief.sourcePath], {
        cwd: pptMasterRoot,
      })
    : skippedRun('ppt-master init failed');
  runs.push({ step: 'ppt-master:import-source', ...sourceImportRun });

  const pptDesignSpecPath = path.join(pptProjectPath, 'design_spec.md');
  await fsp.writeFile(pptDesignSpecPath, buildDesignSpecMarkdown(brief), 'utf8');
  runs.push({ step: 'ppt-master:write-design-spec', ok: true, stdout: `Wrote ${pptDesignSpecPath}`, stderr: '' });

  const templateSourceDir = path.join(pptSkillDir, 'templates', 'layouts', brief.templateKey);
  const templateCopyRun = await runBestEffort('bash', ['-lc', 'if [ -d "$1" ]; then cp "$1"/*.svg "$2"/templates/ 2>/dev/null || true; cp "$1"/design_spec.md "$2"/templates/ 2>/dev/null || true; cp "$1"/*.png "$2"/images/ 2>/dev/null || true; cp "$1"/*.jpg "$2"/images/ 2>/dev/null || true; fi', 'bash', templateSourceDir, pptProjectPath], {
    cwd: pptMasterRoot,
  });
  runs.push({ step: 'ppt-master:copy-template-assets', ...templateCopyRun, templateSourceDir });

  const sourceExt = path.extname(brief.sourcePath).toLowerCase();
  const sourceAlreadyMarkdown = sourceExt === '.md' || sourceExt === '.markdown';
  const sourceIsPdf = sourceExt === '.pdf';
  const sourceIsPlainText = sourceExt === '.txt';
  const markdownPath = sourceAlreadyMarkdown ? brief.sourcePath : inferMarkdownPath(brief.sourcePath);
  let convertRun = skippedRun('ppt-master init failed');
  if (initRun.ok) {
    await callProgress(reportProgress, 'prepare_markdown', '正在提取文档正文与结构', 34);
    await callLog(reportLog, 'analysis', '提取文档结构', '开始把源文档转换成 Markdown，并抽取大纲与页面素材。');
    if (sourceAlreadyMarkdown) {
      convertRun = successRun(`Source already Markdown: ${markdownPath}`);
    } else if (sourceIsPlainText) {
      await fsp.copyFile(brief.sourcePath, markdownPath);
      convertRun = successRun(`Copied plain text source to Markdown: ${markdownPath}`);
    } else if (sourceIsPdf) {
      convertRun = await runBestEffort(pptPython, [pdfToMdScript, brief.sourcePath, '-o', markdownPath], { cwd: pptMasterRoot });
    } else {
      convertRun = await runBestEffort(pptPython, [docToMdScript, brief.sourcePath, '-o', markdownPath], { cwd: pptMasterRoot });
    }
  }
  runs.push({ step: 'ppt-master:doc-to-md', ...convertRun, markdownPath });

  if (sourceAlreadyMarkdown) {
    runs.push({ step: 'ppt-master:import-markdown', ...successRun(`Markdown source already imported via source import: ${markdownPath}`), markdownPath });
  } else if (convertRun.ok) {
    const mdImportRun = await runBestEffort(pptPython, [projectManagerScript, 'import-sources', pptProjectPath, markdownPath], {
      cwd: pptMasterRoot,
    });
    runs.push({ step: 'ppt-master:import-markdown', ...mdImportRun });
  } else {
    runs.push({ step: 'ppt-master:import-markdown', ...skippedRun('markdown conversion unavailable') });
  }

  const validateRun = initRun.ok
    ? await runBestEffort(pptPython, [projectManagerScript, 'validate', pptProjectPath], {
        cwd: pptMasterRoot,
      })
    : skippedRun('ppt-master init failed');
  runs.push({ step: 'ppt-master:validate', ...validateRun });

  await callProgress(reportProgress, 'generate_layout', '正在生成动态页面版式', 68);
  await callLog(reportLog, 'design', '生成版式结构', '将根据大纲生成动态 SVG 页面，再导出成可编辑 PPT。');
  const svgGenerationRun = await runBestEffort('node', [localSvgGeneratorScript, pptProjectPath, brief.projectName, brief.prompt, brief.audience, brief.templateName, convertRun.ok ? markdownPath : '', brief.outlinePath, brief.pages, brief.templateKey], {
    cwd: path.dirname(localSvgGeneratorScript),
  });
  runs.push({ step: 'app-factory:generate-dynamic-svg', ...svgGenerationRun });

  await callProgress(reportProgress, 'export_ppt', '正在导出可编辑 PPT', 92);
  await callLog(reportLog, 'progress', '导出 PPT', '页面版式已完成，正在执行最终导出。');
  const exportRun = initRun.ok
    ? await runBestEffort(pptPython, [svgToPptxScript, pptProjectPath, '-s', 'final'], {
        cwd: pptMasterRoot,
      })
    : skippedRun('ppt-master init failed');
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

async function runStructuredProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let lineBuffer = '';
    let resultPayload = null;
    let settled = false;
    let timer = null;
    let callbackQueue = Promise.resolve();

    const finalizeError = (message) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(new Error(message));
    };

    if (options.timeoutMs && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) {
      timer = setTimeout(() => {
        child.kill('SIGTERM');
        finalizeError(`${path.basename(command)} timed out after ${options.timeoutMs}ms`);
      }, options.timeoutMs);
    }

    const handleLine = (line) => {
      const trimmed = String(line || '').trim();
      if (!trimmed) return;
      if (trimmed.startsWith('__PROGRESS__ ')) {
        try {
          const payload = JSON.parse(trimmed.slice('__PROGRESS__ '.length));
          callbackQueue = callbackQueue.then(() => options.onProgress?.(payload)).catch(() => {});
        } catch {}
        return;
      }
      if (trimmed.startsWith('__LOG__ ')) {
        try {
          const payload = JSON.parse(trimmed.slice('__LOG__ '.length));
          callbackQueue = callbackQueue.then(() => options.onLog?.(payload)).catch(() => {});
        } catch {}
        return;
      }
      if (trimmed.startsWith('__RESULT__ ')) {
        try {
          resultPayload = JSON.parse(trimmed.slice('__RESULT__ '.length));
        } catch {}
      }
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      lineBuffer += chunk;
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() || '';
      for (const line of lines) {
        handleLine(line);
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      finalizeError(error instanceof Error ? error.message : String(error));
    });

    child.on('close', async (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (lineBuffer.trim()) {
        handleLine(lineBuffer);
      }
      await callbackQueue.catch(() => {});
      if (code === 0) {
        resolve({ ok: true, stdout, stderr, resultPayload });
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `${path.basename(command)} exited with code ${code}`));
    });
  });
}

async function createComicMangaProject(brief, projectSlug, reportProgress, reportLog) {
  const runs = [];
  const sourceMaterial = await prepareSourceMaterial(brief, reportProgress, reportLog);
  runs.push(...sourceMaterial.runs);

  if (!sourceMaterial.convertRun.ok || !sourceMaterial.markdownText.trim()) {
    runs.push({
      step: 'comic-manga:prepare-input',
      ...skippedRun('无法从源文档提取可用文本，漫画模板生成已跳过'),
    });
    return {
      provider: 'comic_gemini',
      providerLabel: brief.providerName,
      markdownPath: sourceMaterial.markdownPath,
      exportPptxPath: '',
      runs,
    };
  }

  const comicOutputDir = path.join(brief.projectDir, 'comic-assets');
  const args = [
    comicPptScript,
    '--source',
    sourceMaterial.markdownPath,
    '--output-dir',
    comicOutputDir,
    '--pptx-path',
    brief.exportPptxPath,
    '--outline-path',
    brief.outlinePath,
    '--project-name',
    brief.projectName,
  ];
  if (String(process.env.APP_FACTORY_COMIC_DRY_RUN || '').trim() === '1') {
    args.push('--dry-run');
  }

  await callProgress(reportProgress, 'plan_story', '正在规划漫画分镜', 28);
  await callLog(reportLog, 'design', '漫画模板启动', '开始按文档内容分析页数，并生成图文融合的漫画式设计方案。');

  let processRun;
  try {
    processRun = await runStructuredProcess(repoPython, args, {
      cwd: repoRoot,
      timeoutMs: 25 * 60 * 1000,
      onProgress: async (payload) => {
        await callProgress(
          reportProgress,
          payload.stage || 'generate_pages',
          payload.message || '漫画模板处理中',
          Number(payload.percent || 0),
          {
            current: payload.current,
            total: payload.total,
          },
        );
      },
      onLog: async (payload) => {
        await callLog(
          reportLog,
          payload.kind || 'info',
          payload.title || '运行日志',
          payload.body || '',
          payload.extra || {},
        );
      },
    });
  } catch (error) {
    runs.push({
      step: 'comic-manga:generate',
      ...skippedRun(error instanceof Error ? error.message : String(error)),
    });
    return {
      provider: 'comic_gemini',
      providerLabel: brief.providerName,
      markdownPath: sourceMaterial.markdownPath,
      exportPptxPath: '',
      runs,
    };
  }

  runs.push({
    step: 'comic-manga:generate',
    ok: true,
    stdout: processRun.stdout,
    stderr: processRun.stderr,
  });

  const manifestPath = path.join(comicOutputDir, 'RESULT.json');
  let resultMeta = processRun.resultPayload;
  if ((!resultMeta || !resultMeta.pptxPath) && await pathExists(manifestPath)) {
    try {
      resultMeta = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
    } catch {}
  }

  return {
    provider: 'comic_gemini',
    providerLabel: brief.providerName,
    markdownPath: sourceMaterial.markdownPath,
    exportPptxPath: resultMeta?.pptxPath || resultMeta?.result || brief.exportPptxPath,
    outlinePath: resultMeta?.outlinePath || brief.outlinePath,
    metadataPath: resultMeta?.promptCatalogPath || resultMeta?.manifestPath || manifestPath,
    resultMeta,
    runs,
  };
}

function skippedRun(reason) {
  return {
    ok: false,
    stdout: '',
    stderr: reason,
    error: reason,
  };
}

function successRun(message) {
  return {
    ok: true,
    stdout: message,
    stderr: '',
  };
}

async function ensurePptProjectSkeleton(projectPath) {
  await fsp.mkdir(projectPath, { recursive: true });
  await Promise.all([
    fsp.mkdir(path.join(projectPath, 'templates'), { recursive: true }),
    fsp.mkdir(path.join(projectPath, 'images'), { recursive: true }),
    fsp.mkdir(path.join(projectPath, 'sources'), { recursive: true }),
    fsp.mkdir(path.join(projectPath, 'svg_final'), { recursive: true }),
    fsp.mkdir(path.join(projectPath, 'exports'), { recursive: true }),
  ]);
}

async function writeProjectHandoff(project, pipeline) {
  const handoffPath = path.join(project.projectDir, 'PROJECT_RESULT.md');
  const lines = [
    `# ${project.projectName} · App Factory Result`,
    '',
    `- 状态：${project.status}`,
    `- 引擎：${pipeline.providerLabel || pipeline.provider || activeProvider.label}`,
    `- 上传文件：${project.fileName}`,
    `- 模板：${project.templateName}`,
    `- 页数目标：${project.pages}`,
    `- Markdown：${pipeline.markdownPath || '未生成'}`,
    `- 导出 PPT：${project.exportPptxPath || pipeline.exportPptxPath || '未生成'}`,
    pipeline.pptProjectPath ? `- ppt-master 项目：${pipeline.pptProjectPath}` : '',
    pipeline.externalId ? `- 外部任务 ID：${pipeline.externalId}` : '',
    '',
    '## Pipeline Summary',
    ...(pipeline.runs || []).map((run) => `- ${run.step}: ${run.ok ? 'ok' : 'failed'}`),
  ];
  await fsp.writeFile(handoffPath, lines.filter(Boolean).join('\n'), 'utf8');
  return handoffPath;
}

async function pathExists(filePath) {
  if (!filePath) return false;
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    if (candidate && await pathExists(candidate)) {
      return candidate;
    }
  }
  return '';
}

async function discoverLatestFile(dirPath, predicate) {
  if (!dirPath) return '';
  try {
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    const candidates = [];
    for (const entry of entries) {
      if (!entry.isFile() || !predicate(entry.name)) continue;
      const fullPath = path.join(dirPath, entry.name);
      const stat = await fsp.stat(fullPath);
      candidates.push({ fullPath, mtimeMs: stat.mtimeMs, name: entry.name });
    }
    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name));
    return candidates[0]?.fullPath || '';
  } catch {
    return '';
  }
}

async function resolveProjectArtifactPaths(project) {
  const pptExportsDir = project.pptMasterProjectPath ? path.join(project.pptMasterProjectPath, 'exports') : '';
  const localExportsDir = project.projectDir ? path.join(project.projectDir, 'exports') : '';
  const discoveredNativePptx = await discoverLatestFile(pptExportsDir, (name) => name.endsWith('.pptx') && !name.endsWith('_svg.pptx'));
  const discoveredSvgPptx = await discoverLatestFile(pptExportsDir, (name) => name.endsWith('_svg.pptx'));
  const fallbackNativePptx = await discoverLatestFile(localExportsDir, (name) => name.endsWith('.pptx') && !name.endsWith('_svg.pptx'));
  const fallbackSvgPptx = await discoverLatestFile(localExportsDir, (name) => name.endsWith('_svg.pptx'));

  return {
    exportPptxPath: await firstExistingPath([discoveredNativePptx, project.exportPptxPath, fallbackNativePptx]),
    exportSvgPptxPath: await firstExistingPath([discoveredSvgPptx, project.exportSvgPptxPath, fallbackSvgPptx]),
    markdownPath: await firstExistingPath([
      project.markdownPath,
      /\.(md|markdown)$/i.test(project.sourcePath || '') ? project.sourcePath : '',
    ]),
    outlinePath: await firstExistingPath([project.outlinePath]),
    sourcePath: await firstExistingPath([project.sourcePath]),
    resultDocPath: await firstExistingPath([project.resultDocPath]),
    pipelineRunsPath: await firstExistingPath([project.pipelineRunsPath]),
    providerRunMetadataPath: await firstExistingPath([project.providerRunMetadataPath]),
  };
}

function buildArtifact(projectId, kind, label, filePath) {
  if (!filePath) return null;
  return {
    kind,
    label,
    path: filePath,
    fileName: path.basename(filePath),
    url: `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(kind)}`,
  };
}

async function hydrateProject(project) {
  const resolved = await resolveProjectArtifactPaths(project);
  const artifacts = [
    buildArtifact(project.id, 'pptx', '下载 PPTX', resolved.exportPptxPath),
    buildArtifact(project.id, 'svg_pptx', '下载预览版', resolved.exportSvgPptxPath),
    buildArtifact(project.id, 'outline', '下载大纲', resolved.outlinePath),
    buildArtifact(project.id, 'markdown', '下载 Markdown', resolved.markdownPath),
    buildArtifact(project.id, 'source', '下载原文档', resolved.sourcePath),
    buildArtifact(project.id, 'result', '下载结果说明', resolved.resultDocPath),
    buildArtifact(project.id, 'runs', '下载运行日志', resolved.pipelineRunsPath),
    buildArtifact(project.id, 'provider_meta', '下载引擎返回', resolved.providerRunMetadataPath),
  ].filter(Boolean);

  return {
    ...project,
    ...resolved,
    artifacts,
    ready: Boolean(resolved.exportPptxPath),
  };
}

function contentTypeForPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.md' || ext === '.markdown') return 'text/markdown; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.txt') return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

async function sendDownload(res, filePath) {
  const stat = await fsp.stat(filePath);
  res.writeHead(200, {
    'content-type': contentTypeForPath(filePath),
    'content-length': stat.size,
    'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(filePath))}`,
  });
  fs.createReadStream(filePath).pipe(res);
}

async function runProjectPipeline(brief, projectSlug) {
  let currentProject = brief;
  const reportLog = async (kind, title, body, extra = {}) => {
    currentProject = await patchProject(currentProject.id, (previous) => ({
      ...previous,
      liveLogs: trimProjectLogs([
        ...(Array.isArray(previous.liveLogs) ? previous.liveLogs : []),
        buildProjectLogEntry(kind, title, body, extra),
      ]),
    })) || currentProject;
  };
  const reportProgress = async (stage, message, percent, extra = {}) => {
    currentProject = await patchProject(currentProject.id, (previous) => ({
      ...previous,
      status: stage === 'failed' ? 'failed' : 'running',
      progress: buildProjectProgress(stage, message, percent, extra),
      liveLogs: trimProjectLogs([
        ...(Array.isArray(previous.liveLogs) ? previous.liveLogs : []),
        buildProjectLogEntry(
          extra.logKind || 'progress',
          extra.logTitle || message,
          extra.logBody || (
            extra.current && extra.total
              ? `${message}（${extra.current}/${extra.total}）`
              : message
          ),
          { stage },
        ),
      ]),
    })) || currentProject;
  };

  try {
    await reportProgress('queued', '任务已创建，准备启动生成流程', 4);
    await reportLog('info', '任务排队完成', '后台任务已创建，马上开始正式分析与生成。');
    const pipeline = currentProject.workflow === 'comic_manga'
      ? await createComicMangaProject(currentProject, projectSlug, reportProgress, reportLog)
      : currentProject.provider === 'plus_ai'
        ? await createPlusAiProject(currentProject, projectSlug, reportProgress, reportLog)
        : await createPptMasterProject(currentProject, projectSlug, reportProgress, reportLog);

    const pipelineRunsPath = path.join(currentProject.projectDir, `${currentProject.provider}-runs.json`);
    await fsp.writeFile(pipelineRunsPath, JSON.stringify(pipeline.runs, null, 2), 'utf8');

    const nextProject = {
      ...currentProject,
      pptMasterRoot: pipeline.pptMasterRoot || '',
      pptSkillDir: pipeline.pptSkillDir || '',
      pptPython: pipeline.pptPython || '',
      pptMasterProjectPath: pipeline.pptProjectPath || '',
      pptMasterDesignSpecPath: pipeline.pptDesignSpecPath || '',
      markdownPath: pipeline.markdownPath || '',
      providerRunMetadataPath: pipeline.metadataPath || '',
      providerExternalId: pipeline.externalId || '',
      pipelineRunsPath,
    };

    const resolvedArtifacts = await resolveProjectArtifactPaths({
      ...nextProject,
      pptMasterProjectPath: nextProject.pptMasterProjectPath,
      markdownPath: nextProject.markdownPath,
    });

    nextProject.exportPptxPath = resolvedArtifacts.exportPptxPath || pipeline.exportPptxPath || nextProject.exportPptxPath;
    nextProject.exportSvgPptxPath = resolvedArtifacts.exportSvgPptxPath || pipeline.exportSvgPptxPath || nextProject.exportSvgPptxPath;
    nextProject.markdownPath = resolvedArtifacts.markdownPath || nextProject.markdownPath;
    nextProject.outlinePath = resolvedArtifacts.outlinePath || pipeline.outlinePath || nextProject.outlinePath;

    const hasPpt = Boolean(nextProject.exportPptxPath);
    const allRunsOk = (pipeline.runs || []).every((run) => run.ok);
    nextProject.status = hasPpt && allRunsOk ? 'ready' : hasPpt ? 'partial' : 'failed';
    nextProject.progress = buildProjectProgress(
      nextProject.status === 'failed' ? 'failed' : 'completed',
      nextProject.status === 'ready'
        ? 'PPT 已生成完成，可直接下载'
        : hasPpt
          ? 'PPT 已生成，但部分步骤存在异常，请同时查看运行日志'
          : '生成失败，请查看运行日志',
      100,
    );
    nextProject.liveLogs = trimProjectLogs([
      ...(Array.isArray(nextProject.liveLogs) ? nextProject.liveLogs : []),
      buildProjectLogEntry(
        nextProject.status === 'ready' ? 'success' : nextProject.status === 'partial' ? 'warn' : 'error',
        nextProject.status === 'ready' ? '生成完成' : nextProject.status === 'partial' ? '生成完成但有异常' : '生成失败',
        nextProject.status === 'ready'
          ? 'PPT 已生成，下载区已可直接获取成品。'
          : hasPpt
            ? 'PPT 已产出，但部分步骤异常，建议同时查看运行日志。'
            : '本次生成失败，请根据日志定位问题。',
      ),
    ]);
    nextProject.resultDocPath = await writeProjectHandoff(nextProject, pipeline);
    await upsertProject(nextProject);
    return nextProject;
  } catch (error) {
    const pipelineRunsPath = path.join(currentProject.projectDir, `${currentProject.provider}-runs.json`);
    const failedRuns = [
      {
        step: 'pipeline:unexpected-error',
        ...skippedRun(error instanceof Error ? error.message : String(error)),
      },
    ];
    await fsp.writeFile(pipelineRunsPath, JSON.stringify(failedRuns, null, 2), 'utf8');
    const failedProject = {
      ...currentProject,
      status: 'failed',
      pipelineRunsPath,
      progress: buildProjectProgress('failed', error instanceof Error ? error.message : '生成失败', 100),
      liveLogs: trimProjectLogs([
        ...(Array.isArray(currentProject.liveLogs) ? currentProject.liveLogs : []),
        buildProjectLogEntry('error', '流程异常退出', error instanceof Error ? error.message : '生成失败'),
      ]),
    };
    failedProject.resultDocPath = await writeProjectHandoff(failedProject, {
      provider: failedProject.provider,
      providerLabel: failedProject.providerName,
      markdownPath: failedProject.markdownPath || '',
      exportPptxPath: failedProject.exportPptxPath || '',
      runs: failedRuns,
    });
    await upsertProject(failedProject);
    return failedProject;
  }
}

async function createProject(rawPayload) {
  const payload = normalizeUploadPayload(rawPayload);
  const templateRuntime = resolveTemplateRuntime(payload.provider, payload.templateKey);
  const provider = templateRuntime.requestedProvider;
  const templateMeta = templateRuntime.templateMeta || {};
  const templateDisplayName = templateMeta.displayName || templateMeta.name || payload.templateKey;
  const templateOfficialName = templateMeta.name || templateDisplayName || payload.templateKey;
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
        pageRange: templateRuntime.workflow === 'comic_manga' ? '自动判断（漫画模板推荐）' : (payload.pages || '8-10 页'),
        audience: payload.audience || '',
        style: payload.tone || '高端商务',
        template: templateDisplayName,
        prompt: payload.prompt || '',
        provider: templateRuntime.providerLabel,
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
    status: 'queued',
    projectName: payload.projectName,
    fileName: payload.fileName,
    fileType: payload.fileType || 'application/octet-stream',
    sourceSizeBytes: payload.fileBuffer ? payload.fileBuffer.length : 0,
    provider: templateRuntime.providerKey,
    providerName: templateRuntime.providerLabel,
    workflow: templateRuntime.workflow,
    templateKey: payload.templateKey,
    templateName: templateDisplayName,
    templateDisplayName,
    templateOfficialName,
    audience: payload.audience || '',
    pages: templateRuntime.workflow === 'comic_manga' ? '自动判断（漫画模板推荐）' : (payload.pages || '8-10 页'),
    tone: payload.tone || '高端商务',
    prompt: payload.prompt || '',
    projectSlug,
    projectDir,
    sourcePath,
    outlinePath,
    designSpecPath,
    exportPptxPath,
    exportSvgPptxPath,
    progress: buildProjectProgress('queued', '任务已创建，等待开始生成', 4),
    liveLogs: [
      buildProjectLogEntry('info', '创建任务', `已创建项目《${payload.projectName}》，模板为 ${templateDisplayName}。`),
    ],
  };

  await upsertProject(brief);
  void runProjectPipeline(brief, projectSlug).catch((error) => {
    console.error('[app-factory] background pipeline failed', error);
  });
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

    if (req.method === 'GET' && url.pathname.startsWith('/assets/')) {
      const assetsRoot = path.resolve(root, 'assets');
      const relativeAssetPath = decodeURIComponent(url.pathname.replace(/^\/assets\/+/, ''));
      const assetPath = path.resolve(assetsRoot, relativeAssetPath);
      if (!assetPath.startsWith(`${assetsRoot}${path.sep}`)) {
        sendJson(res, 404, { error: 'Asset not found' });
        return;
      }
      try {
        const asset = await fsp.readFile(assetPath);
        const contentTypes = {
          '.svg': 'image/svg+xml; charset=utf-8',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.webp': 'image/webp',
        };
        res.writeHead(200, {
          'content-type': contentTypes[path.extname(assetPath).toLowerCase()] || 'application/octet-stream',
          'cache-control': 'public, max-age=3600',
        });
        res.end(asset);
      } catch (error) {
        if (error?.code === 'ENOENT') {
          sendJson(res, 404, { error: 'Asset not found' });
          return;
        }
        throw error;
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/templates') {
      sendJson(res, 200, {
        provider: activeProvider.key,
        providerLabel: activeProvider.label,
        defaultTemplateKey: activeProvider.defaultTemplateKey,
        templates: activeProvider.templates,
        templateCategories: activeProvider.categories,
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/projects') {
      const projects = await Promise.all((await readProjects()).map((project) => hydrateProject(project)));
      sendJson(res, 200, { projects });
      return;
    }

    const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (req.method === 'GET' && projectMatch) {
      const projectId = decodeURIComponent(projectMatch[1]);
      const project = await readProject(projectId);
      if (!project) {
        sendJson(res, 404, { error: 'Project not found' });
        return;
      }
      sendJson(res, 200, { project: await hydrateProject(project) });
      return;
    }

    const downloadMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/files\/([^/]+)$/);
    if (req.method === 'GET' && downloadMatch) {
      const projectId = decodeURIComponent(downloadMatch[1]);
      const kind = decodeURIComponent(downloadMatch[2]);
      const project = (await Promise.all((await readProjects()).map((item) => hydrateProject(item))))
        .find((item) => item.id === projectId);
      const artifact = project?.artifacts?.find((item) => item.kind === kind);
      if (!artifact?.path) {
        sendJson(res, 404, { error: 'Artifact not found' });
        return;
      }
      await sendDownload(res, artifact.path);
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
      const project = await hydrateProject(await createProject(payload));
      sendJson(res, 202, { project });
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
