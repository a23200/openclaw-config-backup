## [LRN-20260409-001] best_practice

**Logged**: 2026-04-09T02:50:00+08:00
**Priority**: high
**Status**: applied
**Area**: frontend,backend

### Summary
闲鱼市场调研遇到验证码时，优先接管用户本地正在运行的 Chrome 新开标签页进行人工验证，不再依赖测试浏览器或纯页面内远控拖动。

### Details
- 纯“测试浏览器 + 远控滑块”方案在闲鱼刮刮乐场景下稳定性差，容易出现验证通过率低、拖动不丝滑、会话丢失等问题。
- 更稳定的方案是通过 Playwright `connect_over_cdp` 直接接入用户本地 Chrome，并在当前浏览器中打开搜索页或验证码页。
- 连接本地浏览器时，不能只盯 `http://127.0.0.1:9222/json/version`；更可靠的做法是优先读取 `~/Library/Application Support/Google/Chrome/DevToolsActivePort`，拼出真实 `ws://127.0.0.1:9222/devtools/browser/...` 地址。
- 验证状态不要只依赖“滑块 DOM 是否消失”，当搜索结果已经实时同步到会话中时，应直接视为风险已过，可继续抓取。
- 前端在检测到验证码状态变为完成后，应自动调用恢复抓取接口，并保留手动按钮作为兜底。

### Suggested Action
- 后续所有“市场调研 / 搜索抓取”验证码处理，默认沿用“本地浏览器人工接管 + 自动恢复抓取”方案。
- 如果未来扩展到更多页面，优先复用当前 `local_browser` 模式，而不是重新实现远控拖动。

### Metadata
- Source: conversation
- Related Files: utils/item_search.py, utils/captcha_remote_control.py, api_captcha_remote.py, frontend/components/MarketResearch.tsx
- Tags: captcha, xianyu, local-browser, cdp, market-research

---
## [LRN-20260410-001] correction

**Logged**: 2026-04-10T18:10:00+08:00
**Priority**: high
**Status**: pending
**Area**: backend

### Summary
直接用 `uvicorn reply_server:app` 启动时，不能假设 `cookie_manager.manager` 已初始化。

### Details
账号列表接口 `/cookies/details` 和多处账号管理接口把 `cookie_manager.manager is None` 当成不可用并直接返回空/报错，但当前项目在测试启动方式下经常直接跑 FastAPI，而不是走 `Start.py` 初始化 `CookieManager`。这会导致账号页空白，并让基于数据库即可完成的账号管理操作失效。

### Suggested Action
对纯数据读写接口优先走数据库兜底；仅在确实需要运行态实例时才依赖 `cookie_manager.manager`。

### Metadata
- Source: user_feedback
- Related Files: reply_server.py, frontend/services/api.ts
- Tags: regression, cookie-manager, startup-mode

---
## [LRN-20260411-001] best_practice

**Logged**: 2026-04-11T23:13:40+08:00
**Priority**: high
**Status**: pending
**Area**: backend

### Summary
语音转写消息进入 AI 回复前，避免在 AI 引擎里用不同内容和 UTC 默认时间重复保存同一条用户消息。

### Details
实时消息链路已先把买家语音保存为 `[语音转文字] xxx` 且使用本地消息时间；如果 AI 引擎再保存纯文本 `xxx` 且让数据库默认 `CURRENT_TIMESTAMP`，最近消息判断会把包装后的原消息误判为“更新消息”，导致 AI 返回 None 后走默认回复。

### Suggested Action
调用方已保存消息时传入原始 `msg_time` 并跳过 AI 引擎的用户消息保存；AI 上下文中剥离 `[语音转文字]` 包装词，助手回复也由实际发送链路统一入库，避免重复和时间错序。

### Metadata
- Source: user_feedback
- Related Files: ai_reply_engine.py, XianyuAutoAsync.py
- Tags: voice-reply, debounce, conversation-history, ai-reply

---
