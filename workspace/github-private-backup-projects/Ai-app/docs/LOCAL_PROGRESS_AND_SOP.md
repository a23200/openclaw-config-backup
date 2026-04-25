# 本地进度与调试 SOP

更新时间：2026-04-18 18:55（Asia/Shanghai）

## 1. 当前项目目标

项目名称：`AI应用生成器`

目标链路：

1. 用户输入应用名称和描述
2. AI 生成 PRD
3. 用户编辑 PRD
4. AI 生成完整 Android 工程
5. 后端写入 `temp/{projectId}` 目录
6. 执行 `./gradlew assembleDebug`
7. 产出 APK 到 `public/apks/{projectId}.apk`

核心要求已经明确：

- 主流程**不能**回退到通用模板 APK
- 必须尽量使用“真实需求 → 真实 Android 工程 → 真实编译”的方式产出

---

## 2. 今天已经完成的关键改造

### 2.1 主链路改造

- 已移除主流程中的模板 APK 兜底思路
- 当前主链路为：
  - AI 生成工程
  - 解析代码块写盘
  - 执行 Gradle 编译
  - 编译失败时走 AI 修复循环

### 2.2 编译修复能力

后端已具备：

- AI 工程解析失败后，自动重新生成完整工程
- Gradle / Kotlin 编译失败后，自动带日志与关键文件上下文请求 AI 修复
- 本地常见问题自动修复：
  - 主题父类不兼容
  - Manifest `package` 属性移除
  - Kotlin Compose 插件声明不可解析
  - `menuAnchor(...)` / `MenuAnchorType` API 不兼容
  - `ExposedDropdownMenu` → `DropdownMenu` 本地回退

### 2.3 卡死保护

今天新增的关键能力：

- 流式代码输出如果 **45 秒内没有形成任何有效文件块**
- 自动判定为“假流式 / 卡死”
- 自动中断流式请求
- 自动切换到完整结果模式
- 若完整结果仍解析不到文件，则进入“重新生成完整工程”流程

### 2.4 前端体验修复

- 构建失败时，左侧步骤条不再“三步全红”
- 实时代码流面板已压缩布局，避免头部信息把代码区域挤得过高
- 错误摘要已更可读，不再只显示“退出码 1”

### 2.5 今日二次加固（2026-04-18 下午）

- `server/services/androidBuilder.ts` 抽出 `runStreamingCodegen(projectId, label, invoke)`：首次生成和 regenerate 统一走流式 + 心跳 + 45s 停滞中断
- `CONTAMINATION_SIGNATURES` 检测上游返回的 `to=functions.*` / `{"cmd":"bash` / `yield_time_ms` / `channel=final|analysis` 等工具调用伪装
- `repairCommonAndroidProjectIssues` 新增 AppCompat 主题本地替换 (`Theme.AppCompat.*` → `android:style/Theme.Material.*`)
- `materializeGeneratedProject` `maxAttempts` 从 2 提到 3
- 系统提示迁移至独立 `CODE_GENERATION_SYSTEM_PROMPT`，10 条硬约束（见 `server/prompts.ts`）

---

## 3. 当前环境与约定

### 3.1 端口

- 前端：`http://localhost:5112`
- 后端：`http://127.0.0.1:5137`

### 3.2 当前 AI 配置

配置在 `.env`

- `OPENAI_BASE_URL=https://api.codexzh.com/v1`
- `OPENAI_MODEL=gpt-5.4`
- `OPENAI_CODE_MODEL=cc-gpt-5.4`

说明：

- 代码中对 `api.codexzh.com` 做了模型前缀兼容处理
- 代码生成默认直接使用 `cc-gpt-5.4`

### 3.3 Android / Java

- `ANDROID_HOME=/Users/mac/Library/Android/sdk`
- `JAVA_HOME=/opt/homebrew/opt/openjdk@17`
- Gradle Wrapper 缓存目录：`android-wrapper/`

---

## 4. 当前项目状态快照

### 4.1 已成功产出的 APK（3/3 全部就绪）

1. `随手记账`
   - 项目 ID：`89501d2e-2f28-46ff-9d37-98438a6f1bec`
   - APK：`public/apks/89501d2e-2f28-46ff-9d37-98438a6f1bec.apk` (16 MB)

2. `习惯打卡助手`
   - 项目 ID：`59a52d12-8235-4efe-aae9-a1ae71459d80`
   - APK：`public/apks/59a52d12-8235-4efe-aae9-a1ae71459d80.apk` (8.3 MB)

3. `按时吃药`
   - 项目 ID：`012e97e3-cf85-4578-99d2-eb23d4add303`
   - APK：`public/apks/012e97e3-cf85-4578-99d2-eb23d4add303.apk` (16 MB)

### 4.2 按时吃药 如何跑通（今日收尾）

之前卡在：上游模型偶发返回 `to=functions.exec_command` / 彩票多语言垃圾 / 伪 JSON 工具调用，解析不到任何代码块；以及 Hilt + kapt 在 Kotlin 1.9.x 本地链路下 kapt stub 编译找不到 `SingletonComponent` / `HiltWorker`。

收尾三板斧：

1. **提示词拆分为 system + user，并内联进 user 消息**
   - codexzh 代理 400 拒绝独立 system role，见 `server/services/openai.ts` `buildMessages()`
   - system 提示 10 条硬约束，禁一切自然语言、工具调用伪装、彩票广告
2. **完全禁用 Hilt / Dagger / kapt**
   - 见 `server/prompts.ts` 第 8-10 条；Room 必须走 KSP；WorkManager 不用 HiltWorker
   - DI 统一用 Application 单例 + 手写 `ViewModelProvider.Factory`
3. **污染签名检测 + 解析 0 文件 → 直接重新生成**
   - 见 `server/services/androidBuilder.ts` `CONTAMINATION_SIGNATURES`

最终 3 次重试内 BUILD SUCCESSFUL。

---

## 5. 关键文件位置

### 5.1 后端核心

- `server/services/androidBuilder.ts`
  - 主构建流程
  - AI 工程解析
  - Gradle 编译
  - AI 修复循环
  - 流式卡死检测

- `server/services/openai.ts`
  - OpenAI SDK 封装
  - 模型别名处理
  - 流式 / 非流式请求
  - 新增了 `AbortSignal` 支持

- `server/lib/buildStore.ts`
  - 前端构建状态内存缓存
  - 实时代码流状态
  - 新增 `replaceCodeOutput(...)`

- `server/lib/generatedCodeParser.ts`
  - 解析 AI 返回的文件代码块

### 5.2 前端核心

- `src/pages/BuildProgressPage.tsx`
  - 构建页
  - SSE + 轮询

- `src/components/LiveCodeConsole.tsx`
  - 实时代码流 UI

- `src/components/BuildSteps.tsx`
  - 左侧步骤条

### 5.3 调试产物

- 当前项目原始 AI 输出：
  - `temp/012e97e3-cf85-4578-99d2-eb23d4add303/_raw_model_output.md`

- 当前项目构建目录：
  - `temp/012e97e3-cf85-4578-99d2-eb23d4add303/`

---

## 6. 明天继续调试 SOP

以下步骤按优先顺序执行。

### SOP-1：启动环境

```bash
cd /Users/mac/Desktop/Ai-app
npm run dev
```

确认：

- 前端：`http://localhost:5112`
- 后端：`http://127.0.0.1:5137`

### SOP-2：确认数据库中的最新项目状态

```bash
sqlite3 prisma/dev.db "select id,name,status,apkUrl,updatedAt from Project order by datetime(updatedAt) desc limit 10;"
```

重点关注：

- `012e97e3-cf85-4578-99d2-eb23d4add303`
- `89501d2e-2f28-46ff-9d37-98438a6f1bec`

### SOP-3：看当前构建状态

```bash
curl http://127.0.0.1:5137/api/builds/012e97e3-cf85-4578-99d2-eb23d4add303/status
```

重点字段：

- `status`
- `step`
- `generatedFileCount`
- `streamState`
- `logs`

### SOP-4：如果还卡在 `codegen`

先判断是不是“假流式卡住”：

关键特征：

- `streamState=streaming` 或 `complete`
- `generatedFileCount=0`
- 日志中反复只有：
  - `AI 正在推理项目结构，请稍候…`
  - `正在组织 Gradle、Manifest 与 Compose 页面代码…`
  - `正在生成 MVVM 层与界面代码流…`

如果日志里已经出现：

- `检测到流式输出超过 45 秒仍未形成有效文件块，切换到完整结果模式`

说明新的防卡死逻辑已经生效。

### SOP-5：检查完整结果是否仍然不可解析

```bash
tail -n 80 temp/012e97e3-cf85-4578-99d2-eb23d4add303/_raw_model_output.md
```

看两个问题：

1. 是否根本没有代码块
2. 是否返回的是说明文、计划、分段自然语言，而不是 ` ```文件路径 ... ``` `

如果仍然不是结构化输出，优先改：

- `server/services/openai.ts`
- 进一步收紧 `generateAndroidCode()` / `regenerateAndroidCode()` 提示词

重点目标：

- 让模型必须尽快输出 `settings.gradle.kts`
- 必须尽快输出 `app/build.gradle.kts`
- 必须只输出代码块，不要任何解释文本

### SOP-6：如果已进入编译阶段但失败

先看日志摘要：

```bash
curl http://127.0.0.1:5137/api/builds/012e97e3-cf85-4578-99d2-eb23d4add303/status | jq '.error,.logs[-50:]'
```

再看临时工程：

```bash
find temp/012e97e3-cf85-4578-99d2-eb23d4add303 -maxdepth 4 -type f | sort
```

必要时手动编译：

```bash
cd temp/012e97e3-cf85-4578-99d2-eb23d4add303
./gradlew assembleDebug
```

若失败：

- 优先补本地自动修复规则
- 不够时再走 AI 修复

### SOP-7：如果成功出 APK

检查文件：

```bash
ls -lah public/apks
```

数据库状态应为：

- `status=ready`
- `apkUrl=/apks/{projectId}.apk`

### SOP-8：如果需要重新触发构建

```bash
curl -X POST http://127.0.0.1:5137/api/builds/012e97e3-cf85-4578-99d2-eb23d4add303
```

注意：

- 开发服务热重载时，旧构建会被中断
- 状态接口可能会显示：
  - `检测到开发服务已重启，原构建任务已中断，请重新触发构建。`

这是预期行为，不代表逻辑本身坏了。

---

## 7. 下一步可做（按优先级）

1. **多实例安全**：`buildStore` 目前只在进程内，需改 DB 或 Redis 才能水平扩展
2. **新需求回归测试**：换一个不同领域（导航/游戏/拍照）的 PRD 跑一遍，验证提示词泛化性
3. **zod@3 vs openai@5 peer dep**：`.learnings/ERRORS.md` 仍未解，长期风险
4. **Hilt 解禁探路**：若想重开 Hilt，先在 `temp/` 跑一个 kapt 最小化探针工程；能过再解禁（见 memory `feedback_forbid_hilt_kapt.md`）
5. **修复误入库的脏项目**：`b540f5cf-f61f-4256-be63-1add6e7187a5` (`习惯打开助手` 错别字) 和 `be8113c3-...` (`做一个好用的应用。`) 是 `failed` / `draft`，可清理

---

## 8. 重要原则（不要忘）

- **不要再回到模板 APK 兜底**
- 优先保证：真实需求 → 真实 Android 工程 → 真实编译
- Hilt / Dagger / kapt 在本环境不可靠，生成工程一律手动 DI + Room KSP
- codexzh 代理不收独立 system role 消息，必须内联进 user
- 上游模型偶发返回 agent-style 工具调用伪装（`to=functions.*`），要靠污染签名兜底

---

## 9. 一句话交接

今日把三个测试项目全部推进到可安装 APK，最后一道坎 `按时吃药` 通过「提示词拆分 + Hilt/kapt 全禁 + 污染检测 + 流式 regenerate 统一」四步解决；链路现在是：AI 生成 → 污染检测/重试 → 本地修复 → AI 修复循环 → Gradle 编译 → APK。
