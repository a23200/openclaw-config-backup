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
