# ClawLink 管理控制台交接文档

更新时间：2026-04-12（Asia/Shanghai）

## 项目目标

用户要做一个名为 `ClawLink` 的管理控制台，用来对接 OpenClaw 并替代官方 UI 控制台。当前第一阶段目标是：先具备聊天控制功能，能接通、能创建会话、能发送消息、能查看历史。

## 当前项目位置

项目目录：

```bash
/Users/mac/openclaw-console
```

主要文件：

```text
/Users/mac/openclaw-console/package.json
/Users/mac/openclaw-console/vite.config.js
/Users/mac/openclaw-console/index.html
/Users/mac/openclaw-console/server.mjs
/Users/mac/openclaw-console/README.md
/Users/mac/openclaw-console/src/main.jsx
/Users/mac/openclaw-console/src/App.jsx
/Users/mac/openclaw-console/src/styles.css
```

## 当前已实现功能

### 前端

文件：`/Users/mac/openclaw-console/src/App.jsx`

已实现：

1. 自定义 ClawLink 控制台页面。
2. 聊天控制主界面。
3. 演示模式：不依赖真实后端，本地模拟回复。
4. 真实接口模式：向配置的后端接口发送消息。
5. 健康检查按钮。
6. 创建会话按钮。
7. 加载历史按钮。
8. 左侧会话列表。
9. 点击会话后加载该会话历史消息。
10. 支持手动填写：
    - 聊天接口
    - 创建会话接口
    - 健康检查接口
    - 会话列表接口
    - 历史消息接口
    - `sessionKey`
    - `agentId`
11. 当前聊天消息会发送到选中的 `sessionKey`。
12. 左侧全局导航与多模块控制台框架。
13. 顶部模块状态栏。
14. 工具日志页（当前记录前端活动日志）。
15. 系统设置页。
16. 接口地址、`sessionKey`、`agentId` 与运行模式自动保存到浏览器本地。
17. 参考 FeiControl 的任务中枢风格重构页面信息架构。
18. 新增概览首页、左侧 Dock、顶部搜索位和 Greeting Hero 区。

### 后端

文件：`/Users/mac/openclaw-console/server.mjs`

已实现本地 Node.js 后端代理：

1. `GET /api/health`
   - 检查后端是否在线。
   - 返回当前 OpenClaw 网关配置状态。

2. `POST /api/session`
   - 调用 `sessions_spawn` 创建会话。
   - 依赖 `OPENCLAW_AGENT_ID`。

3. `POST /api/chat`
   - 调用 `sessions_send` 向指定会话发送消息。
   - 依赖 `sessionKey` 和 `agentId`。

4. `GET /api/sessions`
   - 调用 `sessions_list` 获取会话列表。

5. `GET /api/history?sessionKey=...`
   - 调用 `sessions_history` 获取指定会话历史消息。

后端当前默认假设 OpenClaw 工具网关接口为：

```text
${OPENCLAW_BASE_URL}/api/tools/{toolName}
```

如果真实 OpenClaw 网关接口路径不同，需要修改 `server.mjs` 里的 `postOpenClawTool` 函数。

## 启动流程

### 1. 进入项目目录

```bash
cd /Users/mac/openclaw-console
```

### 2. 安装依赖

```bash
npm install
```

### 3. 设置后端环境变量

如果要接真实 OpenClaw，需要设置：

```bash
export OPENCLAW_BASE_URL=http://localhost:8080
export OPENCLAW_GATEWAY_TOKEN=你的网关令牌
export OPENCLAW_AGENT_ID=你的agentId
export OPENCLAW_SESSION_KEY=已有会话可选
```

说明：

- `OPENCLAW_BASE_URL`：OpenClaw 网关地址。
- `OPENCLAW_GATEWAY_TOKEN`：OpenClaw 网关鉴权令牌，如果本地网关不需要鉴权可以先不设。
- `OPENCLAW_AGENT_ID`：创建会话和发送消息需要用到。
- `OPENCLAW_SESSION_KEY`：如果有现成会话就填；没有可以在页面点击“创建会话”。

### 4. 启动本地后端代理

另开一个终端：

```bash
cd /Users/mac/openclaw-console
node server.mjs
```

默认后端地址：

```text
http://localhost:3000
```

### 5. 启动前端

另开一个终端：

```bash
cd /Users/mac/openclaw-console
npm run dev
```

默认前端地址：

```text
http://localhost:4173
```

## 页面使用流程

1. 打开前端页面：`http://localhost:4173`
2. 默认处于“演示模式”，可直接测试 UI 聊天效果。
3. 要接真实后端时，切换为“真实接口模式”。
4. 点击“检查连接”。
5. 如果已有 `sessionKey`，直接填入。
6. 如果没有 `sessionKey`，点击“创建会话”。
7. 点击左侧“刷新”加载会话列表。
8. 点击某个会话，加载历史消息。
9. 在底部输入框输入消息，点击“发送消息”。

## 当前注意事项

1. 当前只是管理控制台原型，还不是完整产品。
2. 前端 UI 目前直接使用 React + Vite + Tailwind CDN。
3. Tailwind 通过 CDN 引入，适合快速原型；后续正式化建议改成本地 Tailwind 构建。
4. `server.mjs` 目前是 Node 原生 HTTP 服务，没有 Express。
5. 后端真实接入是否可用，取决于当前 OpenClaw 网关是否支持 `/api/tools/{toolName}` 形式。
6. 如果真实接口不同，优先改 `postOpenClawTool`。
7. 当前没有登录和权限系统。
8. 前端配置已支持本地持久化，但暂未做多环境配置管理。
9. 工具日志、设备状态、浏览器控制、节点管理等页面已经有控制台骨架，真实数据与动作还未接完。

## 已完成的开发节点

### 第一轮

搭建目录：

```text
/Users/mac/openclaw-console
```

创建最小 Vite React 项目：

- `package.json`
- `vite.config.js`
- `index.html`
- `src/main.jsx`
- `src/App.jsx`
- `src/styles.css`

实现：

- 基础聊天 UI。
- 演示模式。
- 可配置聊天接口。

### 第二轮

新增：

- `server.mjs`
- `GET /api/health`
- `POST /api/session`
- `POST /api/chat`

实现：

- 后端代理雏形。
- 会话创建。
- 消息发送。
- 前端支持填写 `sessionKey` 和 `agentId`。

### 第三轮

扩展：

- `GET /api/sessions`
- `GET /api/history?sessionKey=...`

实现：

- 会话列表。
- 历史消息加载。
- 点击会话切换当前会话。

### 第四轮

扩展：

- 左侧全局导航
- 多模块控制台布局
- 顶部状态栏
- 工具日志页
- 系统设置页
- 本地配置持久化

实现：

- 将聊天控制页挂入新的控制台框架。
- 新增“聊天控制 / 会话管理 / 工具日志 / 节点设备 / 浏览器控制 / 任务调度 / 系统设置”模块导航。
- 新增前端活动日志列表，便于后续替换成真实工具日志。
- 新增设置页，自动保存接口地址、运行模式、`sessionKey` 和 `agentId`。

### 第五轮

参考仓库：

- `https://github.com/Fibi66/FeiControl`

借鉴重点：

- 任务中枢式首页
- 左侧紧凑 Dock 导航
- Greeting Hero + Gateway 状态
- 首页快捷动作与概览卡片
- 模块化 dashboard 组织逻辑

实现：

- 新增“概览”首页作为默认入口。
- 顶部增加任务中枢栏、搜索占位和模式状态。
- 左侧改为 Dock 导航，更接近任务中枢风格。
- 聊天/会话/日志/设置页统一成 dashboard 卡片体系。
- 新增 `src/branding.js` 统一 ClawLink 品牌信息。

## 下一步开发建议

### 阶段 1：把控制台框架正式化

已完成：

1. 左侧全局导航。
2. 多页面/多模块布局。
3. 顶部状态栏。
4. 设置页。
5. 接口地址和默认值本地持久化。

下一步建议：

1. 把“工具日志”页接到真实后端日志数据。
2. 接入节点/设备状态与控制接口。
3. 接入浏览器控制相关接口。
4. 增加任务调度和权限设置的真实页面。

推荐模块：

```text
聊天控制
会话管理
工具调用日志
节点/设备管理
浏览器控制
任务/定时任务
系统设置
```

### 阶段 2：补齐真实 OpenClaw 管理能力

建议接入：

1. `sessions_list`
2. `sessions_history`
3. `sessions_send`
4. `sessions_spawn`
5. `nodes.status`
6. `nodes.describe`
7. `browser.status`
8. `browser.tabs`
9. `cron.list`
10. `cron.runs`

### 阶段 3：设备控制和机械臂控制

用户历史目标中提到希望结合 OpenClaw 控制机械臂。后续可加入：

1. 设备状态面板。
2. 摄像头预览。
3. 机械臂动作按钮。
4. 回原点按钮。
5. 指向物体按钮。
6. VLM 识别结果展示。
7. 机械臂动作日志。
8. 安全急停按钮。

已有历史链路思路：

```text
语音/指令 -> MCP 服务 -> control_robot_arm -> robot_vlm/executor.py -> 机械臂动作 JSON
```

后续可以把这个链路接入控制台，做成按钮和聊天指令两种控制方式。

### 阶段 4：体验增强

建议：

1. 消息流式输出。
2. Markdown 渲染。
3. 工具调用过程可视化。
4. 错误提示标准化。
5. 接口请求日志。
6. 自动保存最近使用的接口地址、`agentId`、`sessionKey`。
7. 深色/浅色主题。
8. 移动端适配。

### 阶段 5：工程化

建议：

1. 改成 TypeScript。
2. 引入本地 Tailwind 配置。
3. 拆分组件：
   - `ChatPanel`
   - `SessionList`
   - `StatusBar`
   - `SettingsPanel`
   - `ApiClient`
4. 引入路由：React Router 或 TanStack Router。
5. 后端改 Express/Fastify，便于扩展。
6. 增加 `.env.example`。
7. 增加基本测试和构建检查。

## 建议下一步具体任务

如果换开发工具继续，建议从这里开始：

1. 打开目录：

```bash
/Users/mac/openclaw-console
```

2. 先运行：

```bash
npm install
node server.mjs
npm run dev
```

3. 浏览器打开：

```text
http://localhost:4173
```

4. 验证演示模式聊天。
5. 设置 OpenClaw 环境变量。
6. 验证“检查连接”。
7. 如果 `/api/tools/{toolName}` 不对，修改：

```text
/Users/mac/openclaw-console/server.mjs
```

重点修改函数：

```text
postOpenClawTool
```

8. 验证真实模式下：

```text
检查连接 -> 创建会话 -> 刷新会话 -> 加载历史 -> 发送消息
```

## 未来产品想法

这个控制台可以逐步做成“ClawLink 私有操作台”：

1. 聊天即控制：通过自然语言操作会话、浏览器、文件、设备和机械臂。
2. 面板即观察：所有工具调用、设备状态、运行日志可视化。
3. 一键任务：把常用流程做成按钮，例如“打开浏览器”“读取摄像头”“机械臂回原点”“检查定时任务”。
4. 安全操作：机械臂、发消息、删文件、执行命令等高风险操作加确认和日志。
5. 多端接入：桌面浏览器、手机、飞书/微信通知都能查看状态。
6. 自定义插件：后续每个 OpenClaw tool 都可以自动生成一个控制面板。

## 给下一位开发工具/Agent 的提示

请优先理解这三个文件：

```text
/Users/mac/openclaw-console/src/App.jsx
/Users/mac/openclaw-console/server.mjs
/Users/mac/openclaw-console/README.md
```

当前最可能需要修改的是：

```text
/Users/mac/openclaw-console/server.mjs
```

尤其是：

```text
postOpenClawTool(toolName, args)
```

因为真实 OpenClaw 网关接口路径和鉴权方式可能与当前假设不同。
