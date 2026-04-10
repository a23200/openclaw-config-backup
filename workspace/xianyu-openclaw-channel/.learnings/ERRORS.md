## [ERR-20260409-001] captcha_remote_control

**Logged**: 2026-04-09T01:58:00+08:00
**Priority**: high
**Status**: in_progress
**Area**: backend

### Summary
人工验证码链路里缺少 `check_failure()`，并且远控拖动缺少历史成功位辅助，导致验证码失败后 WebSocket 易中断、人工落点也不稳定。

### Error
```text
AttributeError: 'CaptchaRemoteController' object has no attribute 'check_failure'
```

### Context
- 触发路径：`/api/bridge/market-research` → `/api/captcha/control/{session_id}`
- 失败现象：人工拖动后闲鱼返回验证失败，之前服务端还会在失败检查阶段抛异常
- 当前补救：补回失败检测、增加拖动日志、接入历史成功位辅助提交按钮

### Suggested Fix
- 保留 `check_failure()` 作为远控协议固定能力
- 每次拖动记录 ratio / target_x / duration
- 优先利用 `trajectory_history/*_success.json` 给人工页提供落点辅助

### Metadata
- Reproducible: yes
- Related Files: utils/captcha_remote_control.py, api_captcha_remote.py, captcha_control.html

---
