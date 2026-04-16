import { useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import './App.css'
import {
  buildAppAnalysisResult,
  createAnalysisSteps,
  type AnalysisJobSnapshot,
  type AppAnalysisResult,
} from './lib/appAnalysis'
import {
  EXAMPLE_PROMPTS,
  PALETTE_OPTIONS,
  type GeneratedApp,
  type GeneratorFormData,
} from './lib/appGenerator'

const INITIAL_FORM: GeneratorFormData = {
  appName: '灵动商城',
  prompt:
    '做一个面向年轻人的电商 App，需要首页推荐、商品搜索、商品详情、购物车、订单管理、优惠券、会员中心和消息提醒。',
  platform: 'android',
  palette: 'violet',
}

type DownloadState = 'idle' | 'downloading' | 'done' | 'error'
type AnalysisState = 'idle' | 'analyzing' | 'done' | 'error'

interface BuildResultInfo {
  filename: string
  downloadUrl: string
  absoluteUrl: string
  appName: string
  localModuleTitle: string
  size: number
}

const INITIAL_ANALYSIS = buildAppAnalysisResult(INITIAL_FORM)
const INITIAL_GENERATED = INITIAL_ANALYSIS.spec
const INITIAL_ANALYSIS_JOB = createCompletedAnalysisJob(INITIAL_ANALYSIS)

function App() {
  const [form, setForm] = useState<GeneratorFormData>(INITIAL_FORM)
  const [generated, setGenerated] = useState<GeneratedApp>(INITIAL_GENERATED)
  const [analysisResult, setAnalysisResult] = useState<AppAnalysisResult>(
    INITIAL_ANALYSIS,
  )
  const [analysisJob, setAnalysisJob] = useState<AnalysisJobSnapshot | null>(
    INITIAL_ANALYSIS_JOB,
  )
  const [analysisState, setAnalysisState] = useState<AnalysisState>('done')
  const [analysisMessage, setAnalysisMessage] = useState<string>(
    '已完成初始需求识别，可直接查看预览。',
  )
  const [lastAnalyzedSignature, setLastAnalyzedSignature] = useState<string>(
    getFormSignature(INITIAL_FORM),
  )
  const [activeScreenId, setActiveScreenId] = useState<string>(
    () => INITIAL_GENERATED.screens[0]?.id ?? '',
  )
  const [downloadState, setDownloadState] = useState<DownloadState>('idle')
  const [buildMessage, setBuildMessage] = useState<string>('')
  const [buildResult, setBuildResult] = useState<BuildResultInfo | null>(null)
  const appNameInputRef = useRef<HTMLInputElement | null>(null)
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null)

  const activeScreen = useMemo(
    () =>
      generated.screens.find((screen) => screen.id === activeScreenId) ??
      generated.screens[0],
    [activeScreenId, generated.screens],
  )

  if (!activeScreen) {
    return null
  }

  const previewStyle = {
    '--accent': generated.palette.accent,
    '--accent-soft': generated.palette.accentSoft,
    '--accent-strong': generated.palette.accentStrong,
    '--accent-contrast': generated.palette.contrast,
    '--surface': generated.palette.surface,
    '--surface-strong': generated.palette.surfaceStrong,
  } as CSSProperties

  const currentSignature = getFormSignature(form)
  const analysisStale = currentSignature !== lastAnalyzedSignature
  const visibleAnalysisJob =
    analysisStale && analysisState !== 'analyzing'
      ? createIdleAnalysisJob()
      : (analysisJob ?? INITIAL_ANALYSIS_JOB)
  const isBusy =
    analysisState === 'analyzing' || downloadState === 'downloading'
  const liveSignals = visibleAnalysisJob.live
  const displayScenario =
    liveSignals?.recognizedScenario ?? analysisResult.insights.recognizedScenario
  const displayConfidence =
    liveSignals?.confidence ?? analysisResult.insights.confidence
  const displayKeywords =
    liveSignals && liveSignals.keywords.length > 0
      ? liveSignals.keywords
      : analysisResult.insights.keywords
  const displayRecognitionSummary =
    liveSignals?.recognitionSummary ?? analysisResult.insights.recognitionSummary
  const displayPages =
    liveSignals && liveSignals.generatedPages.length > 0
      ? liveSignals.generatedPages
      : analysisResult.insights.generatedPages
  const displayLocalModuleTitle =
    liveSignals?.localModuleTitle ??
    (analysisState === 'analyzing'
      ? generated.localModule.title
      : analysisResult.spec.localModule.title)
  const displayLocalModuleDescription =
    liveSignals?.localModuleDescription ??
    (analysisState === 'analyzing'
      ? generated.localModule.description
      : analysisResult.spec.localModule.description)
  const displayLocalTips =
    liveSignals && liveSignals.localTips.length > 0
      ? liveSignals.localTips
      : analysisState === 'analyzing'
        ? generated.localModule.tips
        : analysisResult.spec.localModule.tips
  const displayCoreModules =
    analysisState === 'analyzing'
      ? Array.from(new Set([...displayKeywords, ...generated.features])).slice(0, 6)
      : analysisResult.insights.coreModules
  const displayPrimaryFlow =
    analysisState === 'analyzing'
      ? generated.screens.slice(0, 4).map((screen, index) => {
          if (index === 0) {
            return `${screen.name}：${screen.heroTitle}`
          }

          return `${screen.name}：承接 ${screen.sections[0]?.title ?? '核心内容'} / ${screen.sections[1]?.title ?? '辅助内容'}`
        })
      : analysisResult.insights.primaryFlow
  const displayLocalCapabilities =
    analysisState === 'analyzing'
      ? [displayLocalModuleTitle, ...displayLocalTips.slice(0, 3)]
      : analysisResult.insights.localCapabilities
  const displayDifferentiators =
    analysisState === 'analyzing'
      ? generated.highlights
      : analysisResult.insights.differentiators
  const displayLaunchChecklist =
    analysisState === 'analyzing'
      ? [
          `当前已生成 ${generated.screens.length} 个页面：${displayPages.join('、')}`,
          `本地演示模块：${generated.localModule.title}`,
          '识别完成后可直接生成正式版 APK',
          '如需联网能力，可继续接入正式接口和账户体系',
        ]
      : analysisResult.insights.launchChecklist

  const getCurrentForm = (): GeneratorFormData => ({
    appName: appNameInputRef.current?.value ?? form.appName,
    prompt: promptInputRef.current?.value ?? form.prompt,
    platform: 'android',
    palette: form.palette,
  })

  const runAnalysis = async (
    requestedForm: GeneratorFormData,
    options?: { silent?: boolean },
  ): Promise<AppAnalysisResult> => {
    setForm(requestedForm)
    setAnalysisState('analyzing')
    setAnalysisJob(createStartingAnalysisJob())
    setBuildResult(null)

    if (!options?.silent) {
      setBuildMessage('')
    }

    setAnalysisMessage('AI 正在识别需求并生成结构化预览...')

    try {
      const startResponse = await fetch('/api/analyze-app', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestedForm),
      })

      const startPayload = (await startResponse.json()) as {
        ok: boolean
        jobId?: string
        error?: string
      }

      if (!startResponse.ok || !startPayload.ok || !startPayload.jobId) {
        throw new Error(startPayload.error ?? 'AI 识别任务创建失败')
      }

      while (true) {
        const jobResponse = await fetch(`/api/analyze-app/${startPayload.jobId}`)
        const jobPayload = (await jobResponse.json()) as {
          ok: boolean
          job?: AnalysisJobSnapshot
          error?: string
        }

        if (!jobResponse.ok || !jobPayload.ok || !jobPayload.job) {
          throw new Error(jobPayload.error ?? '读取 AI 识别进度失败')
        }

        const nextJob = jobPayload.job
        setAnalysisJob(nextJob)
        setAnalysisMessage(nextJob.message)

        if (nextJob.previewSpec) {
          setGenerated(nextJob.previewSpec)
          setActiveScreenId((current) =>
            nextJob.previewSpec?.screens.some((screen) => screen.id === current)
              ? current
              : (nextJob.previewSpec?.screens[0]?.id ?? ''),
          )
        }

        if (nextJob.status === 'completed' && nextJob.result) {
          setGenerated(nextJob.result.spec)
          setAnalysisResult(nextJob.result)
          setActiveScreenId(nextJob.result.spec.screens[0]?.id ?? '')
          setAnalysisState('done')
          setLastAnalyzedSignature(getFormSignature(requestedForm))
          setAnalysisMessage(`AI 已完成识别：${nextJob.result.insights.recognizedScenario}`)
          return nextJob.result
        }

        if (nextJob.status === 'failed') {
          throw new Error(nextJob.error ?? nextJob.message ?? 'AI 识别失败')
        }

        await wait(420)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI 识别失败'
      setAnalysisState('error')
      setAnalysisMessage(message)
      setAnalysisJob({
        ...createIdleAnalysisJob(),
        status: 'failed',
        message,
        error: message,
      })
      throw error
    }
  }

  const handleGenerate = async () => {
    const requestedForm = getCurrentForm()
    try {
      await runAnalysis(requestedForm)
    } catch (error) {
      console.error(error)
    }
  }

  const handleExample = async (example: (typeof EXAMPLE_PROMPTS)[number]) => {
    const requestedForm: GeneratorFormData = {
      appName: example.appName,
      prompt: example.prompt,
      platform: 'android',
      palette: example.palette,
    }

    try {
      await runAnalysis(requestedForm)
    } catch (error) {
      console.error(error)
    }
  }

  const handleDownload = async () => {
    if (analysisState === 'analyzing') {
      return
    }

    const currentForm = getCurrentForm()

    if (getFormSignature(currentForm) !== lastAnalyzedSignature) {
      await runAnalysis(currentForm, { silent: true })
    }

    setDownloadState('downloading')
    setBuildResult(null)
    setBuildMessage('正在生成正式版 APK，并同步当前 AI 识别后的页面结构...')

    try {
      const response = await fetch('/api/build-apk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(currentForm),
      })

      const payload = (await response.json()) as {
        ok: boolean
        filename?: string
        downloadUrl?: string
        size?: number
        appName?: string
        localModuleTitle?: string
        error?: string
      }

      if (
        !response.ok ||
        !payload.ok ||
        !payload.downloadUrl ||
        !payload.filename ||
        typeof payload.size !== 'number'
      ) {
        throw new Error(payload.error ?? 'APK 生成失败')
      }

      const absoluteUrl = new URL(payload.downloadUrl, window.location.origin).toString()
      const nextBuildResult: BuildResultInfo = {
        filename: payload.filename,
        downloadUrl: payload.downloadUrl,
        absoluteUrl,
        appName: payload.appName ?? generated.name,
        localModuleTitle:
          payload.localModuleTitle ?? analysisResult.spec.localModule.title,
        size: payload.size,
      }

      setBuildResult(nextBuildResult)

      const anchor = document.createElement('a')
      anchor.href = payload.downloadUrl
      anchor.download = payload.filename
      anchor.click()

      setDownloadState('done')
      setBuildMessage(
        `正式版 APK 已生成：${nextBuildResult.appName} · ${nextBuildResult.localModuleTitle}`,
      )
      window.setTimeout(() => setDownloadState('idle'), 1800)
    } catch (error) {
      console.error(error)
      setDownloadState('error')
      setBuildMessage(error instanceof Error ? error.message : 'APK 生成失败')
    }
  }

  const getGenerateLabel = () => {
    if (analysisState === 'analyzing') {
      return 'AI 识别中...'
    }

    if (analysisState === 'error') {
      return '重试 AI 识别'
    }

    if (analysisStale) {
      return 'AI 识别并生成预览'
    }

    return '重新生成预览'
  }

  const getDownloadLabel = () => {
    if (downloadState === 'downloading') {
      return '正在生成正式版 APK...'
    }

    if (analysisState === 'analyzing') {
      return '等待 AI 识别完成'
    }

    if (downloadState === 'done') {
      return '正式版 APK 已生成'
    }

    if (downloadState === 'error') {
      return '重新生成正式版 APK'
    }

    if (analysisStale) {
      return '自动识别后生成正式版 APK'
    }

    return '生成正式版 APK'
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-main">
          <span className="badge">App 生成</span>
          <h1>写需求，让 AI 识别后生成预览，再导出正式版 APK</h1>
          <p className="hero-text">
            现在不是静态模板。系统会先做需求识别、页面编排、交互补全，再把结果变成可查看预览和可安装的 Android App。
          </p>
        </div>

        <div className="step-strip">
          <div className="step-chip">
            <span>01</span>
            <strong>写需求</strong>
            <small>输入 App 名称与功能诉求</small>
          </div>
          <div className="step-chip">
            <span>02</span>
            <strong>AI 识别</strong>
            <small>可见进度，实时生成预览</small>
          </div>
          <div className="step-chip">
            <span>03</span>
            <strong>正式交付</strong>
            <small>一键导出正式版 `.apk`</small>
          </div>
        </div>
      </section>

      <section className="workspace-grid">
        <article className="panel form-panel">
          <div className="section-heading">
            <span className="section-index">01</span>
            <div>
              <span className="eyebrow">输入需求</span>
              <h2>先写你要做的 App</h2>
            </div>
          </div>

          <label className="field">
            <span>App 名称</span>
            <input
              ref={appNameInputRef}
              value={form.appName}
              onChange={(event) =>
                setForm((current) => ({ ...current, appName: event.target.value }))
              }
              placeholder="例如：轻约到店"
            />
          </label>

          <label className="field">
            <span>需求描述</span>
            <textarea
              ref={promptInputRef}
              value={form.prompt}
              onChange={(event) =>
                setForm((current) => ({ ...current, prompt: event.target.value }))
              }
              rows={10}
              placeholder="请写页面、主要流程、想要展示的功能模块、运营重点，以及希望自带的本地能力..."
            />
          </label>

          <div className="field">
            <span>视觉主题</span>
            <div className="palette-grid">
              {PALETTE_OPTIONS.map((palette) => (
                <button
                  key={palette.id}
                  className={
                    form.palette === palette.id
                      ? 'palette-button palette-button-active'
                      : 'palette-button'
                  }
                  onClick={() =>
                    setForm((current) => ({ ...current, palette: palette.id }))
                  }
                  type="button"
                  disabled={isBusy}
                >
                  <span
                    className="palette-swatch"
                    style={{ background: palette.gradient }}
                  />
                  <strong>{palette.name}</strong>
                  <small>{palette.description}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="quick-examples">
            <span className="eyebrow">快速示例</span>
            <div className="example-list">
              {EXAMPLE_PROMPTS.map((example) => (
                <button
                  key={example.id}
                  className="example-chip"
                  onClick={() => void handleExample(example)}
                  type="button"
                  disabled={isBusy}
                >
                  {example.label}
                </button>
              ))}
            </div>
          </div>

          <div className="action-row">
            <button
              className="primary-button"
              onClick={() => void handleGenerate()}
              type="button"
              disabled={isBusy}
            >
              {getGenerateLabel()}
            </button>
            <button
              className="ghost-button"
              onClick={() => void handleDownload()}
              type="button"
              disabled={isBusy && downloadState !== 'downloading'}
            >
              {getDownloadLabel()}
            </button>
          </div>

          <div className="progress-card">
            <div className="progress-head">
              <strong>AI 识别进度</strong>
              <span>{visibleAnalysisJob.progress}%</span>
            </div>
            <div className="progress-bar">
              <span style={{ width: `${visibleAnalysisJob.progress}%` }} />
            </div>
            <p className="progress-message">
              {analysisStale && analysisState !== 'analyzing'
                ? '当前输入已变更，点击“AI 识别并生成预览”后会重新分析。'
                : analysisMessage}
            </p>

            <div className="progress-step-list">
              {visibleAnalysisJob.steps.map((step) => (
                <div
                  key={step.id}
                  className={
                    step.status === 'done'
                      ? 'progress-step progress-step-done'
                      : step.status === 'running'
                        ? 'progress-step progress-step-running'
                        : 'progress-step'
                  }
                >
                  <span>{step.label}</span>
                  <small>
                    {step.status === 'running' || step.status === 'done'
                      ? step.message
                      : step.description}
                  </small>
                </div>
              ))}
            </div>
          </div>

          <div className="focus-box">
            <strong>这次会附带的本地功能模块</strong>
            <p>{displayLocalModuleTitle}</p>
            <span>{displayLocalModuleDescription}</span>
            <div className="mini-pills compact-pills">
              {displayLocalTips.map((tip) => (
                <span key={tip}>{tip}</span>
              ))}
            </div>
          </div>
        </article>

        <article className="panel preview-panel" style={previewStyle}>
          <div className="section-heading">
            <span className="section-index">02</span>
            <div>
              <span className="eyebrow">AI 生成结果</span>
              <h2>{generated.name}</h2>
            </div>
          </div>

          <p className="preview-summary">{generated.summary}</p>

          {analysisStale ? (
            <div className="status-banner">
              {analysisState === 'analyzing'
                ? 'AI 正在把本次识别结果逐步写入预览，页面会随着进度持续变化。'
                : '当前预览还是上一次识别结果；重新识别后会替换为最新页面方案。'}
            </div>
          ) : null}

          <div className="summary-grid">
            <div className="summary-card">
              <span>识别场景</span>
              <strong>{displayScenario}</strong>
            </div>
            <div className="summary-card">
              <span>目标人群</span>
              <strong>{generated.audience}</strong>
            </div>
            <div className="summary-card">
              <span>识别置信度</span>
              <strong>{displayConfidence}%</strong>
            </div>
          </div>

          <div className="mini-pills highlight-pills">
            {displayKeywords.map((keyword) => (
              <span key={keyword}>{keyword}</span>
            ))}
          </div>

          <div className="analysis-grid">
            <div className="analysis-card">
              <strong>AI 识别结论</strong>
              <p>{displayRecognitionSummary}</p>
              <ul>
                {displayDifferentiators.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="analysis-card">
              <strong>核心模块</strong>
              <ul>
                {displayCoreModules.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="analysis-card">
              <strong>核心流程</strong>
              <ul>
                {displayPrimaryFlow.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="analysis-card">
              <strong>本地可运行能力</strong>
              <ul>
                {displayLocalCapabilities.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="phone-wrapper">
            <div className="phone-frame">
              <div className="phone-notch" />
              <div className="phone-header">
                <div>
                  <span className="eyebrow">App 页面</span>
                  <strong>{generated.name}</strong>
                </div>
                <span className="screen-tag">{activeScreen.name}</span>
              </div>

              <div className="screen-tabs">
                {generated.screens.map((screen) => (
                  <button
                    key={screen.id}
                    className={
                      activeScreen.id === screen.id
                        ? 'screen-tab screen-tab-active'
                        : 'screen-tab'
                    }
                    onClick={() => setActiveScreenId(screen.id)}
                    type="button"
                  >
                    {screen.name}
                  </button>
                ))}
              </div>

              <div className="phone-screen">
                <div className="screen-hero">
                  <div>
                    <span className="screen-eyebrow">{activeScreen.subtitle}</span>
                    <h3>{activeScreen.heroTitle}</h3>
                  </div>
                  <div className="screen-metric">
                    <span>{activeScreen.metricLabel}</span>
                    <strong>{activeScreen.metricValue}</strong>
                  </div>
                </div>

                <div className="chip-row">
                  {activeScreen.chips.map((chip) => (
                    <span key={chip}>{chip}</span>
                  ))}
                </div>

                {activeScreen.sections.map((section) => (
                  <div key={section.title} className="content-card">
                    <div className="content-card-head">
                      <strong>{section.title}</strong>
                      <span>{section.caption}</span>
                    </div>
                    <ul>
                      {section.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="panel build-panel">
        <div className="section-heading">
          <span className="section-index">03</span>
          <div>
            <span className="eyebrow">正式版导出</span>
            <h2>生成可安装的 Android App 安装包</h2>
          </div>
        </div>

        <div className="build-grid">
          <div className="build-card">
            <strong>当前可生成内容</strong>
            <ul className="deliverable-list">
              <li>AI 识别后的页面结构与多屏预览</li>
              <li>内置本地交互功能，不是纯空页面</li>
              <li>可直接安装的正式版 `.apk` 文件</li>
              <li>自动继承当前 App 名称、页面方案和功能模块</li>
            </ul>
          </div>

          <div className="build-card build-result-card">
            <strong>最新 APK 结果</strong>
            {buildResult ? (
              <div className="result-meta">
                <p>{buildResult.filename}</p>
                <span>{formatFileSize(buildResult.size)}</span>
                <a href={buildResult.downloadUrl} download={buildResult.filename}>
                  再次下载正式版 APK
                </a>
                <code>{buildResult.absoluteUrl}</code>
              </div>
            ) : (
              <p className="placeholder-text">
                完成 AI 识别后点“生成正式版 APK”，这里会显示真正输出的安装包地址。
              </p>
            )}

            <div className="delivery-columns">
              <div className="analysis-card compact-card">
                <strong>页面蓝图</strong>
                <ul>
                  {displayPages.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="analysis-card compact-card">
                <strong>上线建议</strong>
                <ul>
                  {displayLaunchChecklist.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            {buildMessage ? <p className="build-message">{buildMessage}</p> : null}

            <button
              className="secondary-button full-width"
              onClick={() => void handleDownload()}
              type="button"
              disabled={analysisState === 'analyzing' || downloadState === 'downloading'}
            >
              {getDownloadLabel()}
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

function createCompletedAnalysisJob(result: AppAnalysisResult): AnalysisJobSnapshot {
  return {
    id: 'initial-analysis',
    status: 'completed',
    progress: 100,
    message: '分析完成',
    steps: createAnalysisSteps().map((step) => ({
      ...step,
      status: 'done',
        progress: 100,
        message: '已完成',
      })),
    live: {
      keywords: [...result.insights.keywords],
      recognizedScenario: result.insights.recognizedScenario,
      recognitionSummary: result.insights.recognitionSummary,
      generatedPages: [...result.insights.generatedPages],
      localModuleTitle: result.spec.localModule.title,
      localModuleDescription: result.spec.localModule.description,
      localTips: [...result.spec.localModule.tips],
      confidence: result.insights.confidence,
    },
    previewSpec: result.spec,
    result,
  }
}

function createIdleAnalysisJob(): AnalysisJobSnapshot {
  return {
    id: 'stale-analysis',
    status: 'queued',
    progress: 0,
    message: '等待开始分析',
    steps: createAnalysisSteps(),
  }
}

function createStartingAnalysisJob(): AnalysisJobSnapshot {
  const steps = createAnalysisSteps()

  return {
    id: 'running-analysis',
    status: 'running',
    progress: 3,
    message: '正在提交 AI 识别任务...',
    steps: steps.map((step, index) =>
      index === 0
        ? {
            ...step,
            status: 'running',
            progress: 12,
            message: '已收到需求，准备解析关键词',
          }
        : step,
    ),
    live: {
      keywords: [],
      generatedPages: [],
      localTips: [],
    },
  }
}

function getFormSignature(form: GeneratorFormData): string {
  return JSON.stringify({
    appName: form.appName.trim(),
    prompt: form.prompt.trim(),
    palette: form.palette,
    platform: form.platform,
  })
}

function formatFileSize(size: number): string {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(2)} MB`
  }

  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }

  return `${size} B`
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export default App
