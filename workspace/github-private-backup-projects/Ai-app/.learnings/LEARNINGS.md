## [LRN-20260418-002] toolchain

**Logged**: 2026-04-18T18:55:00+08:00
**Priority**: high
**Status**: resolved
**Area**: backend / codegen prompt

### Summary
生成的 Android 工程禁用 Hilt / Dagger / kapt，codexzh 代理不收独立 system role 消息，需要污染签名兜底

### Details
三件事必须同时成立，按时吃药项目才稳定出 APK：
1. kapt + Hilt 在 Kotlin 1.9.x 本地链路上 stub 阶段找不到 `SingletonComponent` / `HiltWorker`，即使依赖完全正确。统一改手写 DI + Room KSP。
2. codexzh 代理对 `[{role:"system"},{role:"user"}]` 返回 400；必须把系统提示内联进 user 消息（见 `buildMessages()`）。
3. 上游模型偶发返回 `to=functions.exec_command` / `{"cmd":"bash` / `yield_time_ms` / `channel=final` 这类 agent-style 工具调用伪装 + 彩票/多语言广告，解析不到代码块。需要 `CONTAMINATION_SIGNATURES` 检测后立即重试。

### Suggested Action
保持 `server/prompts.ts` 的 Hilt/kapt 禁令；保持 `buildMessages()` 内联 system 的写法；保持污染签名检测；maxAttempts 不低于 3。

### Metadata
- Source: session_debugging
- Related Files: `server/prompts.ts`, `server/services/openai.ts`, `server/services/androidBuilder.ts`
- Tags: hilt, kapt, prompt-engineering, codexzh-proxy, contamination-detection

### Resolution
- **Resolved**: 2026-04-18T18:51:00+08:00
- **Commit/PR**: local workspace
- **Notes**: 按时吃药 (012e97e3) 在三次重试内 BUILD SUCCESSFUL，产出 16 MB APK。3/3 测试项目全部 APK 就绪。

---

## [LRN-20260418-001] correction

**Logged**: 2026-04-18T04:20:00+08:00
**Priority**: high
**Status**: resolved
**Area**: backend

### Summary
APK 主流程不能退化为通用模板工程，必须围绕当前需求文档生成并编译真实安卓项目

### Details
用户明确纠正：即使模板 APK 可以成功安装，也不符合“AI 应用生成器”的产品目标。正确做法是保留 AI 生成项目作为主产物，在解析失败时重新生成完整工程，在编译失败时基于真实错误日志与工程上下文进行 AI 修复，直到成功或明确失败，而不是切换到通用模板 APK。

### Suggested Action
将主构建链路固定为“需求文档 → AI 生成完整工程 → 解析写盘 → Gradle 编译 → AI 修复重编译”，并避免在活跃代码路径中回退到模板 APK。

### Metadata
- Source: user_feedback
- Related Files: `server/services/androidBuilder.ts`, `server/services/openai.ts`
- Tags: correction, android-build, no-template-apk

### Resolution
- **Resolved**: 2026-04-18T04:29:00+08:00
- **Commit/PR**: local workspace
- **Notes**: 主构建链路已改为真实 AI 工程解析 + AI 编译修复循环；`startBuild()` 不再包含模板 APK 兜底编译路径，并额外收紧了代码生成/修复提示词，禁止退化为通用模板应用。

---
## [LRN-20260420-003] correction

**Logged**: 2026-04-20T20:45:00+08:00
**Priority**: high
**Status**: pending
**Area**: backend / android build pipeline

### Summary
只修临时工程不够，Android 生成器必须内建对 >5 个 Flow combine 的规避与本地修复

### Details
本次先修了一个临时 Kotlin 工程里的编译错误，但用户再次触发新项目构建后，新的 ViewModel 又生成了 `combine(a,b,c,d,e,f) { ... }`。Kotlin 对这种写法只提供到 5 个参数的重载；6 个及以上会落到 `Array<Any?>` 版本，进而报 `Expected one parameter of type Array<Any?>`、类型推断失败等错误。正确做法是同时在三层兜底：1) 生成提示词明确禁止超过 5 个参数的 combine lambda；2) AI 修复提示词加入同样约束；3) 本地自动修复器检测该类错误并把 oversized combine 改写为 `combine(listOf<Flow<Any?>>(…)) { values -> ...cast... }` 或其他等价嵌套写法。

### Suggested Action
保持 `server/prompts.ts`、`server/services/openai.ts`、`server/services/androidBuilder.ts` 三处联动，避免只在 temp/ 下打补丁。

### Metadata
- Source: user_feedback
- Related Files: `server/prompts.ts`, `server/services/openai.ts`, `server/services/androidBuilder.ts`
- Tags: correction, kotlin-flow, combine, android-build

---
## [LRN-20260421-001] best_practice

**Logged**: 2026-04-21T00:00:00+08:00
**Priority**: high
**Status**: resolved
**Area**: backend / android build pipeline

### Summary
Android 生成链路不能只依赖“编译失败后修复”，必须在首次编译前先跑一层静态预修复

### Details
这次反复出错暴露出一个结构性问题：提示词和 AI repair 虽然已经收紧，但如果首次生成代码里出现 Compose 实验 API 缺少 `@file:OptIn`、项目内 top-level extension function 漏 import、以及 `Intent(...).apply { data = Uri.parse(...) }` 这类 receiver 属性被外层同名参数遮蔽的问题，系统仍会先进入一次失败编译。更稳的做法是把“预编译静态修复层”放进统一编译入口，在第一次 `assembleDebug` 前就扫描 Kotlin 文件并修补这些高频坑，同时保留后续编译失败时的本地 repair + AI repair 兜底。

### Suggested Action
保持统一的 precompile guard：首次编译前始终执行 `repairCommonAndroidProjectIssues()`；其中包含依赖推断、静态 opt-in 注入、项目内 extension import 补齐，以及 `.apply { type/data = ... }` 的 receiver 前缀修复。

### Metadata
- Source: user_feedback
- Related Files: `server/services/androidBuilder.ts`
- Tags: android-build, compose, kotlin, prevention, precompile-repair

### Resolution
- **Resolved**: 2026-04-21T00:00:00+08:00
- **Commit/PR**: local workspace
- **Notes**: 已将预编译静态修复层并入统一编译入口，目标是减少首次编译失败率而不是只做失败后补救。

---
## [LRN-20260421-002] best_practice

**Logged**: 2026-04-21T00:35:00+08:00
**Priority**: high
**Status**: resolved
**Area**: backend / android build pipeline

### Summary
Android 生成器必须清洗 Gradle 依赖，避免模型输出不存在或无关的 `androidx.core:core-*` 模块

### Details
真实端到端生成“食材临期管家”时，模型生成了大量重复和不存在的 AndroidX Core 直连依赖，例如 `core-location-altitude`、`core-animation-testing`、`core-uwb`、`core-testing`、`core-performance-play-services` 等，导致首次编译在 `:app:checkDebugAarMetadata` 阶段失败。Kotlin 代码本身不是根因，根因是 Gradle 依赖污染。修复策略应该是生成后/编译前清洗依赖：只允许直接声明 `androidx.core:core-ktx` 和 `androidx.core:core-splashscreen`，删除其它 `androidx.core:core*` 直连模块，并去重所有重复依赖。

### Suggested Action
保持 `sanitizeGradleDependencyDeclarations()` 接入 `repairCommonAndroidProjectIssues()`；提示词和 AI repair 提示都必须要求 Gradle 修复“减法优先”，禁止新增随机 AndroidX Core 模块。

### Metadata
- Source: full_generation_debug
- Related Files: `server/services/androidBuilder.ts`, `server/prompts.ts`, `server/services/openai.ts`
- Tags: android-build, gradle, aar-metadata, dependency-sanitizer, prevention

### Resolution
- **Resolved**: 2026-04-21T00:35:00+08:00
- **Commit/PR**: local workspace
- **Notes**: 同一失败项目重编译前自动移除 15 个不允许的 AndroidX Core 直连模块和 402 个重复依赖，随后 BUILD SUCCESSFUL。

---
## [LRN-20260421-003] best_practice

**Logged**: 2026-04-21T00:57:00+08:00
**Priority**: high
**Status**: resolved
**Area**: backend / android build pipeline

### Summary
Compose 回调中调用 suspend 函数必须在预编译阶段自动修复，不能交给 AI repair 猜

### Details
“马上到家・上门保洁”项目重编译失败，错误包括 `@Composable invocations can only happen from the context of a @Composable function`、`Unresolved reference: launch` 和 `Suspend function 'submitOrder' should be called only from a coroutine`。根因是 AI 修复把 `rememberCoroutineScope()` 放进了 `onClick` 回调，又没有导入 `kotlinx.coroutines.launch`，并直接/间接在普通回调里调用 suspend 函数。正确模式是：在当前 `@Composable` 顶层声明 `val submitScope = rememberCoroutineScope()`，导入 `rememberCoroutineScope` 和 `kotlinx.coroutines.launch`，在 `onClick` 中执行 `submitScope.launch { submitOrder() }`。

### Suggested Action
保持 `repairCoroutineCallbackMisuse()` 接入预编译修复层；提示词和 AI repair 提示都必须禁止在回调内部创建 `rememberCoroutineScope()`，并要求 suspend 回调用 composable 顶层 scope 启动。

### Metadata
- Source: user_feedback
- Related Files: `server/services/androidBuilder.ts`, `server/prompts.ts`, `server/services/openai.ts`
- Tags: compose, coroutine, suspend, onClick, prevention

### Resolution
- **Resolved**: 2026-04-21T00:57:00+08:00
- **Commit/PR**: local workspace
- **Notes**: 同一失败项目预编译阶段自动修复 `Screens.kt` 后 BUILD SUCCESSFUL，APK 已生成。

---
## [LRN-20260421-004] best_practice

**Logged**: 2026-04-21T01:14:00+08:00
**Priority**: high
**Status**: resolved
**Area**: backend / android build pipeline

### Summary
Android 生成器必须在预编译阶段修正本地 symbol import 路径，并删除模型捏造的 Material3 imports

### Details
用户换项目重新生成后，`MainActivity.kt` 把实际声明在 `com.example.homeclean.ui.viewmodels` 包下的 `AppViewModelFactory` 错误 import 成 `com.example.homeclean.ui.AppViewModelFactory`，导致 `viewModels { factory }` 后续出现一串 delegate/type mismatch 级联错误。同时 `AppScreens.kt` import 了不存在的 `androidx.compose.material3.segmentedButtonColors` 和 `segmentedButtonItems`。这类问题不该交给 AI repair 猜，应在编译前扫描项目内 Kotlin declarations，建立唯一 symbol -> 实际 import path 映射，自动修正错误的本地 import，并删除已知不存在的 Compose imports。

### Suggested Action
保持 `repairProjectLocalSymbolImports()` 与 `repairUnsupportedComposeImports()` 接入 `repairGeneratedProjectKnownPitfalls()`；提示词继续要求本地类 import 与实际 package 完全一致，禁止捏造 Material3 API。

### Metadata
- Source: user_feedback
- Related Files: `server/services/androidBuilder.ts`, `server/prompts.ts`, `server/services/openai.ts`
- Tags: kotlin-imports, material3, compose, prevention, android-build

### Resolution
- **Resolved**: 2026-04-21T01:14:00+08:00
- **Commit/PR**: local workspace
- **Notes**: 同一失败项目预编译阶段自动修正 `MainActivity.kt` 和 `AppScreens.kt` 后 BUILD SUCCESSFUL。

---

## [LRN-20260421-005] best_practice

**Logged**: 2026-04-21T01:59:00+08:00
**Priority**: critical
**Status**: resolved
**Area**: backend / android build pipeline / workflow

### Summary
Android 生成器问题必须修“生成器防线”，不能只修 `temp/` 当前项目，也不能在未完成端到端验证前说修彻底。

### Details
这次用户连续换项目仍然失败，说明真正风险不在某个 APK 临时目录，而在生成器会反复产出同类 Kotlin/Gradle 坑。有效处理方式是：先用真实 `build.log` 复现，不猜；再把错误归到具体模式；然后把修复做进 `repairCommonAndroidProjectIssues()` / `repairGeneratedProjectKnownPitfalls()` 等预编译防线；最后必须用失败项目走完整链路验证，包括 `npm run lint`、`npm run build`、重启 `node dist/server/index.js`、调用 `/api/builds/:id?skipCodegen=1`、确认 `BUILD SUCCESSFUL` 和 `public/apks/<projectId>.apk`。对用户只能报告已验证的范围，不能把“当前项目过了”夸成“所有未来问题都绝对没有”。

### Suggested Action
以后遇到“换项目仍失败”时，默认按全盘复查处理：保留日志、修生成器预修复、重跑同项目接口、记录 `.learnings`；如果 API 限制不能重新生成，就至少用现有 temp 项目做 `skipCodegen` 和本地 Gradle 双验证。

### Metadata
- Source: user_feedback
- Related Files: `server/services/androidBuilder.ts`, `.learnings/ERRORS.md`
- Tags: android-build, codegen, verification, prevention, workflow

### Resolution
- **Resolved**: 2026-04-21T01:59:00+08:00
- **Commit/PR**: local workspace
- **Notes**: 已记录本次 `UiState.Success<*>` 类型擦除事故、局部修复验证不足问题，以及后续必须执行的端到端验证闭环。

---

## [LRN-20260421-006] best_practice

**Logged**: 2026-04-21T02:35:00+08:00
**Priority**: critical
**Status**: resolved
**Area**: backend / android build pipeline / workflow

### Summary
Android 生成反复失败的根因不是单一 bug，而是“模型持续产生新错误模式，而生成器预修复覆盖滞后”。

### Details
多次失败汇总后可以确认：问题并不只是某一条 Kotlin 错误或某一个临时项目目录损坏。更深层的原因是生成器在不同题材下会反复产出新的 Compose / Kotlin / Gradle 错误模式，而当前防线主要依赖“见一个补一个”。此前已经识别并记录过的高频模式包括：预编译前缺少静态修复、Gradle 依赖污染、Compose 协程回调误用、本地 import 与假 API、`UiState.Success<*>` 造成的类型擦除，以及“局部修复后未完成端到端验证”的流程缺口。本次新项目 `9be414d7-64a9-49cb-bb33-253310169d60` 又暴露了几种新的未覆盖模式：`first(flow)` 调用形式错误、`androidx.compose.ui.unit.dp(16)` 错误写法、`LocalContext.current` 作用域错误，以及 `UiState` 泛型推断过窄导致 `.catch { emit(UiState.Error(...)) }` 报类型不匹配。这说明“反复失败”的本质是生成器规则集落后于模型产生错误的速度。

### Suggested Action
后续不要只把失败按“这次修好了没有”来判断，而应持续维护“失败模式清单”。每发现一个新模式，都要先归类到总清单，再决定是否纳入 `androidBuilder.ts` 的预编译修复链路、提示词约束和 AI repair 提示。总清单已保存到 `.learnings/android-build-failure-causes-summary-2026-04-21.md`。

### Metadata
- Source: user_feedback
- Related Files: `.learnings/android-build-failure-causes-summary-2026-04-21.md`, `server/services/androidBuilder.ts`
- Tags: android-build, recurrence, generator, prevention, workflow

### Resolution
- **Resolved**: 2026-04-21T02:35:00+08:00
- **Commit/PR**: local workspace
- **Notes**: 已将“这些次失败的总原因”与“本次新暴露的错误模式”独立整理成本地汇总文件，便于后续持续补防线。

---
## [LRN-20260423-001] best_practice

**Logged**: 2026-04-23T00:00:00+08:00
**Priority**: high
**Status**: pending
**Area**: backend

### Summary
固定 Android 生成架构后，仍需对 AI 常见 Kotlin 误写模式做预编译修复，否则会在同一固定架构内反复出现局部编译失败。

### Details
本次重复失败并非 Gradle 栈漂移，而是固定文件架构下的 Kotlin 细节错误：AutoMirrored Forum 图标误用、普通 Composable 里调用 Modifier.weight、Scaffold 的 PaddingValues 被当成 Modifier 传递、以及 ViewModel 中 map 返回 Flow 导致 StateFlow<Any>。仅锁版本与目录结构不足以消除这类错误，需要在生成后、编译前增加稳定的源码修复器与更严格的 prompt 约束。

### Suggested Action
持续把高频 Kotlin 编译错误沉淀为 server/services/androidBuilder.ts 的预修复规则，并同步写入 server/prompts.ts，优先在编译前修复而不是等失败后重试。

### Metadata
- Source: conversation
- Related Files: server/services/androidBuilder.ts, server/prompts.ts
- Tags: android, kotlin, compose, codegen, compile-stability

---
