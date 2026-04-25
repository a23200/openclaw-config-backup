# AI应用生成器

一个完整的 Web 平台：用户输入应用名称与描述后，系统会调用 OpenAI 生成安卓应用 PRD，支持在网页中编辑需求文档，并进一步生成 Kotlin + Jetpack Compose 安卓项目代码，自动写入文件系统、执行 Gradle 编译并输出可下载的 APK。

## 技术栈

- 前端：React 18 + TypeScript + Vite + Tailwind CSS v3 + shadcn/ui 风格组件
- 编辑器：TipTap
- 后端：Node.js + Express + TypeScript
- 数据库：SQLite + Prisma ORM
- AI：OpenAI 官方 SDK，调用 `gpt-4o`
- 构建：Android SDK + Gradle 命令行工具 / Gradle Wrapper

## 核心功能

- 首页输入应用名称与简短描述，创建项目并生成首版需求文档
- 项目编辑页支持 TipTap 富文本编辑 PRD
- AI 辅助工具栏支持重新生成需求、优化文案、添加功能
- 一键触发代码生成、文件落盘、Gradle 编译与 APK 归档
- 构建进度页实时显示垂直步骤条与滚动日志
- 编译成功后可直接下载 `/apks/{projectId}.apk`

## 项目结构

```text
.
├── prisma/
│   └── schema.prisma
├── server/
│   ├── config.ts
│   ├── index.ts
│   ├── lib/
│   ├── routes/
│   └── services/
├── src/
│   ├── components/
│   ├── lib/
│   └── pages/
├── public/apks/
├── temp/
├── android-wrapper/
└── .env.example
```

## 环境准备

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制并编辑环境变量：

```bash
cp .env.example .env
```

`.env` 至少包含：

```bash
OPENAI_API_KEY=your_openai_api_key
OPENAI_BASE_URL=https://api.codexzh.com/v1
OPENAI_MODEL=gpt-5.4
OPENAI_CODE_MODEL=cc-gpt-5.3-codex
ANDROID_HOME=/Users/mac/Library/Android/sdk
JAVA_HOME=/opt/homebrew/opt/openjdk@17
GRADLE_WRAPPER_DIR="/Users/mac/Make app/android"
```

### 3. 确认系统依赖

本项目默认依赖以下命令已可用：

- `sqlite3`
- `gradle`（用于首次自动缓存 Gradle Wrapper）
- Android SDK 与 `ANDROID_HOME`
- Java 17+（Android 构建推荐）

可选检查：

```bash
which sqlite3
which gradle
echo $ANDROID_HOME
java -version
```

## 启动开发环境

```bash
npm run dev
```

启动后：

- 前端：`http://localhost:5112`
- 后端：`http://localhost:3001`

首次启动会自动完成：

- Prisma Client 生成（`postinstall`）
- SQLite 数据库初始化（启动时自动建表）
- `public/apks` 与 `temp` 目录创建

## 构建生产版本

```bash
npm run build
npm start
```

说明：

- `npm run build` 会生成 `dist/client` 与 `dist/server`
- `npm start` 会启动 Express 服务，并在生产模式下直接托管前端静态资源

## API 列表

### 必选接口

- `POST /api/projects`：创建项目并生成初始 PRD
- `GET /api/projects/:id`：获取项目详情
- `PUT /api/projects/:id`：更新需求文档
- `POST /api/builds/:id`：触发代码生成与 APK 编译
- `GET /api/builds/:id/status`：查询构建状态与日志

### 扩展接口

- `POST /api/projects/:id/assist`：AI 辅助重新生成 / 优化 PRD / 添加功能

## 构建流程说明

后端严格按以下流程执行：

1. 调用 OpenAI 生成结构化 PRD
2. 保存项目到 SQLite
3. 用户在编辑器中修改 PRD
4. 点击“确认并生成APK”
5. 调用 OpenAI 生成完整安卓项目代码
6. 使用正则解析 AI 输出中的 ```````文件路径``` + 代码块
7. 将代码写入 `./temp/{projectId}`
8. 从 `./android-wrapper` 复制 `gradlew`、`gradlew.bat` 与 `gradle/`
9. 若本地缓存不存在，则先用系统 `gradle wrapper` 自动生成并缓存
10. 执行 `cd ./temp/{projectId} && ./gradlew assembleDebug`
11. 将产物移动到 `./public/apks/{projectId}.apk`
12. 更新数据库状态为 `ready`，并写入 `apkUrl`

若失败：

- 返回错误日志到状态轮询接口
- 项目状态更新为 `failed`

## 数据库模型

Prisma Schema 按要求定义如下：

```prisma
model Project {
  id          String   @id @default(uuid())
  name        String
  description String?
  prd         String
  apkUrl      String?
  status      String   @default("draft")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

状态流转：

- `draft`
- `generating`
- `building`
- `ready`
- `failed`

## 关键实现说明

### AI 提示词

后端在 `server/prompts.ts` 中硬编码了：

- 需求生成提示词模板
- 安卓项目代码生成提示词模板

### 文件解析

代码生成结果通过正则表达式解析：

- 匹配格式：` ```文件路径 ... ``` `
- 自动校验路径，阻止 `../` 越界写入

### Gradle Wrapper 缓存

构建服务会优先读取 `./android-wrapper`。

若不存在：

- 自动执行 `gradle wrapper --gradle-version 8.7`
- 将生成的 Wrapper 文件缓存到 `./android-wrapper`
- 后续构建直接复制缓存，提高速度

## 部署建议

### 单机部署

适合开发或内部工具：

```bash
npm install
npm run build
npm start
```

确保服务器具备：

- Node.js 18+
- Java 17+
- Android SDK
- Gradle
- 可写目录权限（`public/apks`、`temp`、`prisma`）

### 反向代理

可用 Nginx 将流量代理到 `http://localhost:3001`，并保留长时间构建请求与 APK 下载能力。

## 验证命令

```bash
npm run lint
npm run build
npm run dev
```

## 调试交接

当前本地进度、关键问题和明日继续调试 SOP 已保存到：

- `docs/LOCAL_PROGRESS_AND_SOP.md`

## 注意事项

- 真实生成 APK 依赖 OpenAI 返回的安卓工程质量
- 构建日志当前以内存缓存形式保留，适合单实例运行
- 若计划多实例部署，建议将构建日志与任务状态迁移到 Redis / 队列系统
