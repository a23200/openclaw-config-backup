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
