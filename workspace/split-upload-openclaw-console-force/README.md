# ClawLink 控制台

`ClawLink` 是面向正式使用的本地控制台：产品名是 `ClawLink`，职责是对接 `OpenClaw`，把聊天、会话、日志和节点状态收拢成一个可长期使用的任务中枢。

## 当前能力

- 参考 `FeiControl` 的 dashboard 风格重做控制台信息架构
- 默认优先连接真实 `OpenClaw Gateway`
- 自动读取本机 `~/.openclaw/openclaw.json`
- 自动发现 Gateway 地址、鉴权 token 和默认 agent
- 已接入官方 Gateway RPC：
  - `sessions.list`
  - `sessions.create`
  - `chat.history`
  - `chat.send`
  - `node.list`
  - `device.pair.list`
- 支持会话列表、历史消息、发送消息、创建会话
- 支持系统总览与后端活动日志筛选
- 已支持单端口提供前端页面与后端 API

## 正式启动

第一次安装依赖：

```bash
cd /Users/mac/openclaw-console
npm install
```

正式使用推荐直接：

```bash
cd /Users/mac/openclaw-console
npm run start
```

启动后直接打开：

- `http://localhost:3000`

## 开发模式

前端开发：

```bash
cd /Users/mac/openclaw-console
npm run dev
```

后端开发：

```bash
cd /Users/mac/openclaw-console
npm run server
```

开发时前端地址：

- `http://localhost:4173`

`Vite` 已把 `/api/*` 代理到 `http://127.0.0.1:3000`。

## 配置来源

默认会自动从本机配置读取：

- `~/.openclaw/openclaw.json`

也支持手动覆盖：

```bash
export OPENCLAW_BASE_URL=http://127.0.0.1:18789
export OPENCLAW_GATEWAY_WS_URL=ws://127.0.0.1:18789
export OPENCLAW_GATEWAY_TOKEN=你的网关令牌
export OPENCLAW_AGENT_ID=你的agentId
export OPENCLAW_SESSION_KEY=已有会话可选
```

如果本机已正确安装并配置 `OpenClaw`，通常不需要额外设置这些变量。

## API

- `GET /api/health`
- `GET /api/sessions`
- `GET /api/history?sessionKey=...`
- `GET /api/activity-logs`
- `GET /api/system/overview`
- `POST /api/session`
- `POST /api/chat`

## 当前状态

目前已经不是单纯 mock demo：

- 首页默认走 `live` 模式
- 会自动做健康检查
- 会自动带出默认 `sessionKey` / `agentId`
- 会真实读取 OpenClaw 会话与历史

## 后续可继续补

1. 浏览器控制页接入真实自动化能力
2. 任务调度页接入自动运行与队列
3. 节点设备页补操作按钮与详情抽屉
4. 日志页补导出、清理和跳转联动
