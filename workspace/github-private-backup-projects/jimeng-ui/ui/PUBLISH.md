# 抖音发布:CDP attach 模式

## 核心承诺

**发布通过 CDP(Chrome DevTools Protocol)attach 到一个长期运行的专用调试 Chrome 实例。user-data-dir 固定,登录一次,永久复用。不 headless、不临时 profile、不每次重新登录。**

| 约束 | 实现 |
|------|------|
| 不要 headless | Chrome 以普通 GUI 窗口启动,可见 |
| 不要每次新建 profile | 固定 user-data-dir = `~/.jimeng-publish-chrome` |
| 不要隔离 session | 同一个 user-data-dir 持续使用,cookie/localStorage 持久化 |
| 复用登录态 | 手动在这个 Chrome 里登录一次抖音,永久复用 |
| 通过调试模式连接 | `--remote-debugging-port=9222`,后端用 Playwright `connect_over_cdp` |
| 新开标签 | `context.new_page()` 在现有 Chrome 进程里开新 tab |
| 不要每次重新登录 | ✓ |

## 为什么用专用 Chrome 而不是系统默认 Chrome

Chrome 136+ 为防 Cookie-Bite 攻击,**默认 Profile 启动时会拒绝 `--remote-debugging-port`**(Google 2025 Q1 安全策略)。要让调试端口可用,只能用一个非默认的 user-data-dir。

所以策略是:**在一个固定的、专用的 user-data-dir 上跑一份 Chrome,它作为你的"发布专用浏览器"长期存活**。你在里面登录一次抖音,之后它就是你的发布机器。对你日常使用的那份 Chrome 毫无影响。

---

## 调用方式

### Python 层

`ui/douyin_cdp_publisher.py::publish_via_cdp(folder, config_path, endpoint='http://127.0.0.1:9222') -> dict`

`ui/jimeng_ui_app.py::publish_to_douyin` 是 thin wrapper,调用上面那个。

### HTTP

| 端点 | 作用 |
|------|------|
| `GET /api/browser/status` | 返回 CDP preflight |
| `POST /api/browser/launch` | 如果调试 Chrome 没在跑,启动它 |
| `POST /api/browser/test` | attach + 开一个 `about:blank` 标签,验证 CDP 通路 |
| `POST /api/jobs/{id}/publish` | 触发实际发布 |

### preflight 返回字段

```json
{
  "ready": true,
  "backend": "cdp",
  "cdp_endpoint": "http://127.0.0.1:9222",
  "debug_port": 9222,
  "port_open": true,
  "cdp_ok": true,
  "chrome_version": "Chrome/136.0.7103.93",
  "process_running": true,
  "user_data_dir": "/Users/mac/.jimeng-publish-chrome"
}
```

`ready` 要求 `port_open && cdp_ok`,即端口可连 **且** 返回合法的 `/json/version` JSON。

---

## 启动参数

后端触发 `/api/browser/launch` 时的等价命令:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=$HOME/.jimeng-publish-chrome \
  --no-first-run \
  --no-default-browser-check \
  about:blank
```

你也可以自己在终端敲这一行,效果一样。

**启动后要做一次**:在这个新 Chrome 里登录抖音创作者后台(<https://creator.douyin.com>)。登录完成后,cookie 写进 `~/.jimeng-publish-chrome`,后面永远复用。

---

## 依赖

- Python:`playwright` + chromium 二进制(`.venv/bin/python -m playwright install chromium`)
- 系统:Google Chrome 安装在 `/Applications/Google Chrome.app`
- 约 20MB 磁盘(user-data-dir,主要是 cookies / local storage / 缓存)

已在 `.venv` 里装好。

---

## 发布流程内部

1. `connect_over_cdp('http://127.0.0.1:9222')` — attach
2. `browser.contexts[0]` — 抓默认 context(你登录过抖音的那个)
3. `context.new_page()` — 在现有 Chrome 窗口里开新 tab
4. `page.goto(DOUYIN_UPLOAD_URL)`
5. 找 `input[type="file"]` → `set_input_files(video_path)`
6. `wait 25s`(视频上传 + 抖音解析)
7. 找 `.zone-container [contenteditable="true"]` → 填标题+描述+#标签
8. 找第二个 file input → 上传封面 → 点"完成"
9. `wait 1.5s` → 点"发布"按钮
10. `wait 8s` → 读页面文本,正则捞抖音链接
11. `browser.close()` — 只断 CDP 连接,**不关 Chrome**,不关 tab

---

## 失败兜底

| 症状 | 诊断 | 处理 |
|------|------|------|
| `port_open=false, process_running=false` | 调试 Chrome 没启动 | 点"启动调试 Chrome"或手动敲上面那行 |
| `port_open=false, process_running=true` | Chrome 跑着但没开调试口 | 关掉它重启(它可能是你不小心用默认命令起的) |
| `port_open=true, cdp_ok=false` | 端口被其他进程占 | `lsof -iTCP:9222 -sTCP:LISTEN` 查是谁 |
| `连接超时` | CDP 握手慢 | 重试一次,或重启调试 Chrome |
| 发布日志里 `找不到"发布"按钮` | 抖音改版 | 对照 `/Users/mac/.agents/skills/douyin-creator-tools/src/publish-douyin-video.mjs` 同步选择器 |
| 发布日志里 `等页面跳转超时` | 视频太大没传完 | 把 `_click_publish` 前的 `wait_for_timeout(25000)` 拉大到 40s |

### 降级路径

1. **手动发布**:`storage/{job_id}/douyin_publish.json` 里 `videoPath` / `title` / `description` / `coverPath` 都是完整的绝对路径,可以手动打开抖音创作者后台拖文件上传。
2. **重启调试 Chrome**:
   ```bash
   pkill -f "user-data-dir=$HOME/.jimeng-publish-chrome"
   curl -X POST http://127.0.0.1:8787/api/browser/launch
   ```
3. **清理 user-data-dir 重新登录**(最后才用,会丢登录态):
   ```bash
   rm -rf ~/.jimeng-publish-chrome
   curl -X POST http://127.0.0.1:8787/api/browser/launch
   # 然后手动登录抖音
   ```

### 日志

- `storage/{job_id}/douyin_publish.log` — 这次发布的时序日志
- `storage/{job_id}/douyin_publish_result.json` — 结构化结果(status/link/error/elapsed_sec)
- uvicorn 控制台 — Playwright 异常栈

---

## 关键文件

- `ui/douyin_cdp_publisher.py` — CDP 发布主流程(Playwright connect_over_cdp)
- `ui/jimeng_ui_app.py` — FastAPI 端点 + 调试 Chrome 启动器 + preflight
- `/Users/mac/.agents/skills/douyin-creator-tools/src/publish-douyin-video.mjs` — 选择器真相来源(Node Playwright 版),抖音改版时对照改
