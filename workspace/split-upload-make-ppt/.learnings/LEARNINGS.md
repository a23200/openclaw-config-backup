## [LRN-20260415-001] correction

**Logged**: 2026-04-15T21:30:00+08:00
**Priority**: high
**Status**: pending
**Area**: backend

### Summary
用户明确要求用 Google 生图模型并喂参考图时，不能再静默回退到本地绘制

### Details
本次动漫版 PPT 结果偏差大的根因，不只是提示词不够细，还包括脚本在 `--use-gemini` 预期下没有把归档里的样图/参考图一并发送给模型，而且在缺少 API key 时直接回退成本地绘制，容易让人误以为已经按要求调用了 Google 生图链路。

### Suggested Action
对 `ClawLink` 生成脚本固定接入归档参考图与参考提示词；在显式启用 Gemini 时，如果缺少 API key 或缺少参考图，直接报错而不是兜底成本地绘制。

### Metadata
- Source: user_feedback
- Related Files: scripts/build_clawlink_image_ppt_demo.py
- Tags: gemini, reference-image, fallback, prompt

---
## [LRN-20260415-002] correction

**Logged**: 2026-04-15T21:55:00+08:00
**Priority**: high
**Status**: pending
**Area**: backend

### Summary
用户要求“生图”时，不能调用只是复用底图再叠字的脚本

### Details
`build_core_competitiveness_gemini_style_demo.py` 原先只是加载既有背景图，再本地叠加标题、屏幕字和页码。虽然文件名带有 `gemini_style`，但它并没有实际调用 Google/Gemini 生图接口。用户明确指出这一点后，应把该脚本改成逐页真实生图，而不是继续使用静态样板。

### Suggested Action
对所有带 `gemini` / `google` 命名的脚本，明确区分“真实 API 生图”和“本地参考图叠字”；真实生图脚本在 README 与 RESULT 里都要标注原始底图目录和 prompt 清单。

### Metadata
- Source: user_feedback
- Related Files: scripts/build_core_competitiveness_gemini_style_demo.py
- Tags: gemini, script-selection, local-overlay, correction

---
## [LRN-20260416-001] best_practice

**Logged**: 2026-04-16T11:30:00+08:00
**Priority**: high
**Status**: pending
**Area**: backend

### Summary
漫画风 PPT 已固定为独立模板工作流，必须走“参考图喂模 + Gemini 真生图 + 图文融合 + 动态页数 + 进度回传”

### Details
用户明确要求把这套动漫/漫画版 PPT 生成思路沉淀下来，并在网站模板里直接可选。后续只要用户选择 `漫画风 PPT` 模板，就不能再走普通商务模板链路，也不能退回到“本地叠标题”的伪生图方式，而是要读取归档参考图，把参考图和页面内容一起发给 Gemini，并在前端持续回传“解析文档 / 规划页数 / 第 X/N 页生图 / 打包 PPT”的实时进度。

### Suggested Action
把 `comic_manga_ppt` 固化为站点模板键；维护独立脚本与 SOP；后续所有相关迭代都以该模板工作流为准。

### Metadata
- Source: user_feedback
- Related Files: scripts/build_comic_manga_ppt.py, scripts/app-factory-preview.cjs, src/app-factory/index.html, docs/comic-ppt-workflow.md
- Tags: comic-template, gemini, progress, workflow, memory

---
## [LRN-20260416-002] best_practice

**Logged**: 2026-04-16T17:35:00+08:00
**Priority**: medium
**Status**: pending
**Area**: frontend

### Summary
长流程不能只给进度条，必须同步输出流式日志，把“分析结果”和“设计思路”直接展示给用户

### Details
用户已经明确要求在生成区下方持续看到过程日志，而不是只看到百分比。对漫画风 PPT 这类长任务，单纯显示“第几步”不够，至少还要让用户看到文档分析结果、设计思路、每页生成计划和最终打包状态，这样用户能判断系统是否真的按要求在做。

### Suggested Action
项目状态里持久化 `liveLogs`，前端轮询时同步渲染日志面板；脚本侧用结构化日志事件补充“分析 / 设计 / 页面计划”。

### Metadata
- Source: user_feedback
- Related Files: scripts/app-factory-preview.cjs, src/app-factory/index.html, scripts/build_comic_manga_ppt.py
- Tags: streaming-log, ux, long-running-task, comic-template

---
