import { randomUUID } from 'node:crypto'
import {
  buildAppAnalysisResult,
  createAnalysisSteps,
  type AnalysisLiveSignals,
  type AnalysisJobSnapshot,
  type AnalysisStepState,
  type AppAnalysisResult,
} from '../src/lib/appAnalysis'
import type { GeneratedApp, GeneratorFormData, PaletteId } from '../src/lib/appGenerator'

const STEP_PHASES = [
  {
    from: 4,
    to: 20,
    messages: [
      '正在拆解需求文本',
      '正在识别业务关键词',
      '正在提取用户、场景和核心动作',
    ],
  },
  {
    from: 20,
    to: 40,
    messages: [
      '正在计算行业场景匹配度',
      '正在判断产品定位和运营目标',
      '正在生成识别结论',
    ],
  },
  {
    from: 40,
    to: 66,
    messages: [
      '正在生成页面蓝图',
      '正在编排底部导航和核心页面',
      '正在把需求模块写入预览结构',
    ],
  },
  {
    from: 66,
    to: 88,
    messages: [
      '正在选择本地可运行功能模块',
      '正在生成样例数据和交互动作',
      '正在检查刷新后的本地保存能力',
    ],
  },
  {
    from: 88,
    to: 98,
    messages: [
      '正在整理 APK 生成参数',
      '正在同步 App 名称、页面和本地功能',
      '正在准备最终交付结果',
    ],
  },
]

export function createAnalysisJob(): AnalysisJobSnapshot {
  return {
    id: randomUUID(),
    status: 'queued',
    progress: 0,
    message: '等待开始分析',
    steps: createAnalysisSteps(),
    live: createEmptyLiveSignals(),
  }
}

export async function runAnalysisJob(
  rawForm: Partial<GeneratorFormData>,
  onUpdate: (job: AnalysisJobSnapshot) => void,
  baseJob?: AnalysisJobSnapshot,
): Promise<AppAnalysisResult> {
  const form = normalizeForm(rawForm)
  const job = baseJob ?? createAnalysisJob()

  updateJob(job, {
    status: 'running',
    progress: 4,
    message: '已接收需求，准备开始分析',
    live: createEmptyLiveSignals(),
  })
  onUpdate(cloneJob(job))

  const result = buildAppAnalysisResult(form)
  const keywords = result.insights.keywords.slice(0, 6)
  const structureTicks = result.spec.screens.map(
    (screen, index) =>
      `已生成页面 ${index + 1}/${result.spec.screens.length}：${screen.name} · ${screen.heroTitle}`,
  )
  const localTicks = [
    `已挂载本地模块：${result.spec.localModule.title}`,
    ...result.spec.localModule.tips.slice(0, 2).map((tip) => `本地能力：${tip}`),
  ]

  await advanceStep(
    job,
    0,
    keywords.map((_, index) => {
      const prefix = index === 0 ? '已提取关键词' : '继续提取关键词'
      return `${prefix}：${keywords.slice(0, index + 1).join(' / ')}`
    }),
    onUpdate,
    (_, tickIndex) => {
      const nextKeywords = keywords.slice(0, tickIndex + 1)
      updateJob(job, {
        live: {
          ...ensureLive(job.live),
          keywords: nextKeywords,
        },
      })
    },
  )

  await advanceStep(
    job,
    1,
    [
      `已识别场景：${result.insights.recognizedScenario}`,
      `目标用户：${result.insights.targetUsers}`,
      `核心价值：${result.spec.valueProp}`,
      `识别置信度：${result.insights.confidence}%`,
    ],
    onUpdate,
    () => {
      updateJob(job, {
        live: {
          ...ensureLive(job.live),
          keywords,
          recognizedScenario: result.insights.recognizedScenario,
          recognitionSummary: result.insights.recognitionSummary,
          confidence: result.insights.confidence,
        },
      })
    },
  )
  await advanceStep(
    job,
    2,
    structureTicks,
    onUpdate,
    (_, tickIndex) => {
      const screenCount = tickIndex + 1
      updateJob(job, {
        live: {
          ...ensureLive(job.live),
          keywords,
          recognizedScenario: result.insights.recognizedScenario,
          recognitionSummary: result.insights.recognitionSummary,
          confidence: result.insights.confidence,
          generatedPages: result.spec.screens
            .slice(0, screenCount)
            .map((screen) => screen.name),
        },
        previewSpec: createProgressPreview(result.spec, screenCount),
      })
    },
  )
  await advanceStep(
    job,
    3,
    localTicks,
    onUpdate,
    () => {
      updateJob(job, {
        live: {
          ...ensureLive(job.live),
          keywords,
          recognizedScenario: result.insights.recognizedScenario,
          recognitionSummary: result.insights.recognitionSummary,
          confidence: result.insights.confidence,
          generatedPages: result.spec.screens.map((screen) => screen.name),
          localModuleTitle: result.spec.localModule.title,
          localModuleDescription: result.spec.localModule.description,
          localTips: [...result.spec.localModule.tips],
        },
        previewSpec: createProgressPreview(result.spec, result.spec.screens.length),
      })
    },
  )
  await advanceStep(
    job,
    4,
    [
      `已整理页面蓝图：${result.spec.screens.map((screen) => screen.name).join(' / ')}`,
      `已同步交付内容：${result.spec.name} · ${result.spec.localModule.title}`,
      'APK 参数已准备完成，可直接生成正式版安装包',
    ],
    onUpdate,
    () => {
      updateJob(job, {
        live: {
          ...ensureLive(job.live),
          keywords,
          recognizedScenario: result.insights.recognizedScenario,
          recognitionSummary: result.insights.recognitionSummary,
          confidence: result.insights.confidence,
          generatedPages: result.spec.screens.map((screen) => screen.name),
          localModuleTitle: result.spec.localModule.title,
          localModuleDescription: result.spec.localModule.description,
          localTips: [...result.spec.localModule.tips],
        },
        previewSpec: createProgressPreview(result.spec, result.spec.screens.length),
      })
    },
  )

  markAllStepsDone(job.steps)
  updateJob(job, {
    status: 'completed',
    progress: 100,
    message: `分析完成：已生成 ${result.spec.name} 预览方案`,
    live: {
      keywords,
      recognizedScenario: result.insights.recognizedScenario,
      recognitionSummary: result.insights.recognitionSummary,
      generatedPages: result.spec.screens.map((screen) => screen.name),
      localModuleTitle: result.spec.localModule.title,
      localModuleDescription: result.spec.localModule.description,
      localTips: [...result.spec.localModule.tips],
      confidence: result.insights.confidence,
    },
    previewSpec: result.spec,
    result,
  })
  onUpdate(cloneJob(job))

  return result
}

function normalizeForm(rawForm: Partial<GeneratorFormData>): GeneratorFormData {
  return {
    appName: typeof rawForm.appName === 'string' ? rawForm.appName : '智能应用',
    prompt: typeof rawForm.prompt === 'string' ? rawForm.prompt : '',
    platform: 'android',
    palette: normalizePalette(rawForm.palette),
  }
}

function normalizePalette(palette: unknown): PaletteId {
  if (
    palette === 'violet' ||
    palette === 'ocean' ||
    palette === 'emerald' ||
    palette === 'sunset'
  ) {
    return palette
  }

  return 'violet'
}

async function advanceStep(
  job: AnalysisJobSnapshot,
  stepIndex: number,
  messages: string[],
  onUpdate: (job: AnalysisJobSnapshot) => void,
  onTick?: (job: AnalysisJobSnapshot, tickIndex: number) => void,
) {
  const phase = STEP_PHASES[stepIndex] ?? STEP_PHASES[STEP_PHASES.length - 1]
  const tickMessages = messages.length > 0 ? messages : phase.messages
  const totalTicks = tickMessages.length

  for (let index = 0; index < totalTicks; index += 1) {
    const ratio = (index + 1) / totalTicks
    const progress = Math.round(phase.from + (phase.to - phase.from) * ratio)
    const stepProgress = Math.round(ratio * 100)
    const tickMessage =
      tickMessages[index] ??
      phase.messages[index] ??
      phase.messages[phase.messages.length - 1] ??
      '分析中'

    onTick?.(job, index)

    job.steps = job.steps.map((step, currentIndex) =>
      toStepState(step, currentIndex, stepIndex, tickMessage, stepProgress),
    )
    updateJob(job, {
      status: 'running',
      progress,
      message: tickMessage,
    })
    onUpdate(cloneJob(job))
    await delay(getTickDelay(tickMessage, stepIndex))
  }
}

function toStepState(
  step: AnalysisStepState,
  index: number,
  activeIndex: number,
  message: string,
  stepProgress: number,
): AnalysisStepState {
  if (index < activeIndex) {
    return {
      ...step,
      status: 'done',
      progress: 100,
      message: '已完成',
    }
  }

  if (index === activeIndex) {
    return {
      ...step,
      status: 'running',
      progress: stepProgress,
      message,
    }
  }

  return {
    ...step,
    status: 'pending',
    progress: 0,
    message: '等待开始',
  }
}

function markAllStepsDone(steps: AnalysisStepState[]) {
  for (const step of steps) {
    step.status = 'done'
    step.progress = 100
    step.message = '已完成'
  }
}

function updateJob(
  job: AnalysisJobSnapshot,
  patch: Partial<AnalysisJobSnapshot>,
) {
  Object.assign(job, patch)
}

function cloneJob(job: AnalysisJobSnapshot): AnalysisJobSnapshot {
  return {
    ...job,
    steps: job.steps.map((step) => ({ ...step })),
    live: job.live
      ? {
          ...job.live,
          keywords: [...job.live.keywords],
          generatedPages: [...job.live.generatedPages],
          localTips: [...job.live.localTips],
        }
      : undefined,
    previewSpec: job.previewSpec
      ? {
          ...job.previewSpec,
          features: [...job.previewSpec.features],
          screens: job.previewSpec.screens.map((screen) => ({
            ...screen,
            chips: [...screen.chips],
            sections: screen.sections.map((section) => ({
              ...section,
              items: [...section.items],
            })),
          })),
          highlights: [...job.previewSpec.highlights],
          localModule: {
            ...job.previewSpec.localModule,
            tips: [...job.previewSpec.localModule.tips],
            sampleItems: job.previewSpec.localModule.sampleItems.map((item) => ({ ...item })),
          },
          packageContents: [...job.previewSpec.packageContents],
          buildSteps: [...job.previewSpec.buildSteps],
        }
      : undefined,
    result: job.result
      ? {
          ...job.result,
          insights: {
            ...job.result.insights,
            keywords: [...job.result.insights.keywords],
            coreModules: [...job.result.insights.coreModules],
            generatedPages: [...job.result.insights.generatedPages],
            primaryFlow: [...job.result.insights.primaryFlow],
            localCapabilities: [...job.result.insights.localCapabilities],
            dataObjects: [...job.result.insights.dataObjects],
            launchChecklist: [...job.result.insights.launchChecklist],
            differentiators: [...job.result.insights.differentiators],
          },
        }
      : undefined,
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function createEmptyLiveSignals(): AnalysisLiveSignals {
  return {
    keywords: [],
    generatedPages: [],
    localTips: [],
  }
}

function ensureLive(live: AnalysisJobSnapshot['live']): AnalysisLiveSignals {
  return live ? live : createEmptyLiveSignals()
}

function createProgressPreview(spec: GeneratedApp, screenCount: number): GeneratedApp {
  const visibleScreens = spec.screens.slice(0, Math.max(1, screenCount))

  return {
    ...spec,
    screens: visibleScreens.map((screen) => ({
      ...screen,
      chips: [...screen.chips],
      sections: screen.sections.map((section) => ({
        ...section,
        items: [...section.items],
      })),
    })),
    features: [...spec.features],
    highlights: [
      `${visibleScreens.length}/${spec.screens.length} 张页面已生成`,
      spec.localModule.title,
      '识别结果持续写入预览',
      '本地功能模块可直接带入 APK',
    ],
    localModule: {
      ...spec.localModule,
      tips: [...spec.localModule.tips],
      sampleItems: spec.localModule.sampleItems.map((item) => ({ ...item })),
    },
    packageContents: [...spec.packageContents],
    buildSteps: [...spec.buildSteps],
  }
}

function getTickDelay(message: string, stepIndex: number): number {
  const base = 220 + stepIndex * 30
  const variable = Math.min(220, Math.round(message.length * 4.5))
  return base + variable
}
