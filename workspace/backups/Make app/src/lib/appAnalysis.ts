import {
  generateAppSpec,
  type GeneratedApp,
  type GeneratorFormData,
} from './appGenerator'

export type AnalysisJobStatus = 'queued' | 'running' | 'completed' | 'failed'
export type AnalysisStepStatus = 'pending' | 'running' | 'done'

export interface AnalysisStepState {
  id: string
  label: string
  description: string
  status: AnalysisStepStatus
  progress: number
  message: string
}

export interface AppAnalysisInsights {
  recognizedScenario: string
  recognitionSummary: string
  targetUsers: string
  keywords: string[]
  coreModules: string[]
  generatedPages: string[]
  primaryFlow: string[]
  localCapabilities: string[]
  dataObjects: string[]
  launchChecklist: string[]
  differentiators: string[]
  confidence: number
}

export interface AppAnalysisResult {
  spec: GeneratedApp
  insights: AppAnalysisInsights
  generatedAt: string
}

export interface AnalysisLiveSignals {
  keywords: string[]
  recognizedScenario?: string
  recognitionSummary?: string
  generatedPages: string[]
  localModuleTitle?: string
  localModuleDescription?: string
  localTips: string[]
  confidence?: number
}

export interface AnalysisJobSnapshot {
  id: string
  status: AnalysisJobStatus
  progress: number
  message: string
  steps: AnalysisStepState[]
  live?: AnalysisLiveSignals
  previewSpec?: GeneratedApp
  result?: AppAnalysisResult
  error?: string
}

const SCENARIO_LABELS: Record<GeneratedApp['category'], string> = {
  commerce: '电商零售',
  social: '社区内容',
  booking: '预约服务',
  education: '教育培训',
  fitness: '运动健康',
  finance: '财务管理',
  enterprise: '企业协作',
  generic: '通用业务',
}

const DIFFERENTIATOR_MAP: Record<GeneratedApp['category'], string[]> = {
  commerce: ['推荐 + 搜索 + 购物车闭环', '支持本地收藏与下单演示', '适合活动页和会员体系展示'],
  social: ['信息流互动闭环', '支持草稿、点赞、收藏演示', '可快速验证社区内容分发结构'],
  booking: ['预约时段直接可选', '本地预约记录立即可见', '适合门店、咨询、服务预约业务'],
  education: ['课程任务路径清晰', '本地学习进度立即反馈', '适合课程付费和训练营场景'],
  fitness: ['习惯追踪与打卡可演示', '适合健康运营与会员留存', '本地数据反馈更适合冷启动展示'],
  finance: ['收支记录和统计一体化', '本地账单即时汇总', '适合钱包、预算、记账应用'],
  enterprise: ['任务、审批、协作链路清楚', '适合管理后台与移动工作台', '更利于展示多角色流程'],
  generic: ['生成结构稳定', '支持本地功能快速演示', '适合作为 MVP 原型入口'],
}

export const ANALYSIS_STEP_TEMPLATES: Array<
  Pick<AnalysisStepState, 'id' | 'label' | 'description'>
> = [
  {
    id: 'parse',
    label: '解析需求',
    description: '提取业务目标、用户群与关键关键词',
  },
  {
    id: 'position',
    label: '识别定位',
    description: '识别行业场景、核心价值与主要变现场景',
  },
  {
    id: 'structure',
    label: '生成页面',
    description: '组装首页、功能页、详情页、个人中心等核心结构',
  },
  {
    id: 'interaction',
    label: '补全交互',
    description: '补全本地可运行功能、样例数据与交互路径',
  },
  {
    id: 'deliver',
    label: '输出结果',
    description: '整理预览数据与后续 APK 生成参数',
  },
]

export function createAnalysisSteps(): AnalysisStepState[] {
  return ANALYSIS_STEP_TEMPLATES.map((step) => ({
    ...step,
    status: 'pending',
    progress: 0,
    message: '等待开始',
  }))
}

export function buildAppAnalysisResult(form: GeneratorFormData): AppAnalysisResult {
  const spec = generateAppSpec(form)

  return {
    spec,
    insights: buildInsights(form, spec),
    generatedAt: new Date().toISOString(),
  }
}

function buildInsights(
  form: GeneratorFormData,
  spec: GeneratedApp,
): AppAnalysisInsights {
  const keywords = extractKeywords(form.prompt, form.appName, spec.features)
  const primaryFlow = spec.screens.slice(0, 4).map((screen, index) => {
    if (index === 0) {
      return `${screen.name}：${screen.heroTitle}`
    }

    return `${screen.name}：承接 ${screen.sections[0]?.title ?? '核心内容'} / ${screen.sections[1]?.title ?? '辅助内容'}`
  })
  const generatedPages = spec.screens.map((screen) => screen.name)
  const coreModules = spec.features.slice(0, 6)
  const localCapabilities = [
    spec.localModule.title,
    ...spec.localModule.tips.slice(0, 3),
  ]
  const dataObjects = buildDataObjects(spec)
  const launchChecklist = [
    `确认品牌名称、图标与启动页资源`,
    `优先上线 ${spec.features.slice(0, 3).join('、')} 这批核心模块`,
    `将 ${spec.localModule.title} 作为首个可演示闭环`,
    `后续按业务需要接入真实 API 与账户体系`,
  ]
  const differentiators = DIFFERENTIATOR_MAP[spec.category]
  const confidence = clamp(
    Math.round(78 + Math.min(18, form.prompt.trim().length / 14 + spec.features.length)),
    78,
    96,
  )

  return {
    recognizedScenario: SCENARIO_LABELS[spec.category],
    recognitionSummary: `${SCENARIO_LABELS[spec.category]}方向，面向${spec.audience}，核心价值是${spec.valueProp}。`,
    targetUsers: spec.audience,
    keywords,
    coreModules,
    generatedPages,
    primaryFlow,
    localCapabilities,
    dataObjects,
    launchChecklist,
    differentiators,
    confidence,
  }
}

function extractKeywords(
  prompt: string,
  appName: string,
  features: string[],
): string[] {
  const rawParts = prompt
    .split(/[\n，,。；;、：:\s]+/g)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2)

  return unique([
    appName,
    ...features,
    ...rawParts.filter((part) => /[\u4e00-\u9fa5a-zA-Z0-9]/.test(part)).slice(0, 10),
  ]).slice(0, 8)
}

function buildDataObjects(spec: GeneratedApp): string[] {
  const objects = [
    `${spec.localModule.title}记录`,
    `${spec.screens[0]?.name ?? '首页'}配置`,
    ...spec.features.slice(0, 3).map((feature) => `${feature}数据`),
  ]

  return unique(objects).slice(0, 5)
}

function unique(items: string[]): string[] {
  return items.filter((item, index) => item && items.indexOf(item) === index)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
