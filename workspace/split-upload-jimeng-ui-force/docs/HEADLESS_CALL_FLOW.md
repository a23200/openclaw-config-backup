# jimeng-ui 抖音发布调用方式说明（供开发工具学习）

本文档专门说明 `jimeng-ui` 当前与抖音发布相关的两种实现思路、历史可用模式、当前排查结论，以及后续开发时应优先采用的方式。

适用对象：
- 接手 `jimeng-ui` 的开发工具 / Agent
- 需要继续改造抖音发布链路的工程师
- 需要区分“历史已验证方案”和“当前待修方案”的维护者

---

## 1. 先说结论

当前要区分两种不同方案，不要混为一谈：

### 方案 A：固定已登录 profile 的真实 Chrome 模式
这是**历史上真正跑通过**、并且更稳定的方案。

特点：
- 使用 Playwright `launchPersistentContext(...)`
- `headless: false`
- `channel: "chrome"`
- 使用固定的 profile 目录保存登录态
- 首次登录后长期复用
- 看起来像“复用浏览器登录态”，但本质上是**复用固定 profile**

这套方式在历史脚本中已经存在。

---

### 方案 B：attach 当前桌面正在使用的 Chrome 主会话
这是用户现在明确想要的方案。

目标：
- 不新开独立浏览器实例
- 不使用临时 profile
- 不重复登录
- 直接连接当前桌面正在使用的 Chrome
- 通过 CDP / `remote-debugging-port` 附加到现有浏览器
- 在当前浏览器会话中**新开标签页**完成抖音发布

注意：
- 这是用户当前最想要的体验
- 但**本轮排查中，这条链路还没有真正跑通**
- 原因不在业务表单，而在浏览器 attach 实现层

---

## 2. 本轮排查得到的关键结论

### 2.1 本机 9222 调试口确实存在
已经确认：
- 本机 Chrome 正在运行
- `127.0.0.1:9222` 正在监听
- `http://127.0.0.1:9222/json/version` 可正常返回浏览器信息

说明：
- 用户本机已经存在浏览器调试入口
- 不是“完全没有开调试模式”

---

### 2.2 但当前 attach 链路没有真正接通
实测发现：
- `playwright.chromium.connectOverCDP("http://127.0.0.1:9222")`
  在当前环境下报错
- 报错核心为：
  - `Browser.setDownloadBehavior`
  - `Browser context management is not supported`

这意味着：
- 不能简单把原有 `launchPersistentContext` 逻辑加一个 `connectOverCDP()` 就当作 attach 模式
- 必须单独实现“attach 专用逻辑”
- attach 模式与 persistent profile 模式需要彻底拆开

---

### 2.3 当前 Chrome 调试状态还存在 target 不完整问题
排查结果：
- `http://127.0.0.1:9222/json/version` 有返回
- 但 `http://127.0.0.1:9222/json/list` 为空数组 `[]`

这说明：
- 浏览器级调试口虽然开着
- 但当前没有可被正常接管的 page target
- 所以 attach 到“当前会话并直接新开 tab”的链路没有完整成立

---

## 3. 历史已验证方案在哪里

以下文件体现的是历史上跑通过的“固定 profile 复用模式”：

### 3.1 认证与登录保持
文件：`/Users/mac/.agents/skills/douyin-creator-tools/src/auth-douyin.mjs`

特点：
- 使用 `launchPersistentPage(...)`
- 会把登录状态保存到固定目录
- 后续其他发布/查看命令复用同一份鉴权

---

### 3.2 早期真实可用的视频发布脚本
文件：`/Users/mac/.agents/skills/douyin-creator-tools/src/publish_now.mjs`

特点：
- 直接 `launchPersistentContext(...)`
- `headless: false`
- `channel: "chrome"`
- 使用固定 profile
- 在真实浏览器页面完成上传、字幕、文案、发布

这说明：
- 历史上真正稳定的方式，是“真实 Chrome + 固定 profile + 持久化登录态”
- 不是 attach 当前主浏览器 tab

---

### 3.3 其他同类历史脚本
文件：
- `/Users/mac/.agents/skills/auto-douyin-video/scripts/publish-video.mjs`
- `/Users/mac/.agents/skills/douyin-creator-tools/src/publish-douyin-video.mjs`

这些脚本也都围绕：
- 非 headless
- 真实 Chrome
- 固定浏览器 profile
- 页面自动上传

展开，而不是围绕“CDP attach 当前主浏览器”展开。

---

## 4. 对开发工具最重要的约束

后续开发时，必须明确以下铁律：

### 4.1 不要把两种模式混在一起
**错误做法**：
- 在原有 persistent context 脚本里硬塞 `connectOverCDP`
- 认为这样就等于“支持 attach 当前浏览器”

**正确做法**：
- persistent profile 模式是一套独立实现
- attach 当前浏览器模式是另一套独立实现
- 两者要有明确开关与分支

---

### 4.2 当前默认应优先恢复历史可用模式
在业务不能中断的前提下，建议：
- 默认发布路径先走“固定 profile 的真实 Chrome 模式”
- 这样可以先保证 `jimeng-ui` 的抖音发布恢复可用
- 再单独继续修“attach 当前桌面浏览器”模式

---

### 4.3 attach 模式不要再只做表面参数改造
如果继续做 attach 模式，不能只做：
- 新增 `--attach`
- 新增 `--cdp-url`
- 然后沿用原 `launchPersistentContext` 逻辑

必须做：
- attach 专用 browser/context/page 管理逻辑
- attach 专用新建 tab 策略
- attach 专用关闭行为（关闭 tab，而不是关浏览器）
- attach 专用失败检测与回退策略

---

## 5. 推荐的工程化结构

建议后续把发布器拆成两个显式模式：

### 模式 1：`persistent-profile`
含义：
- 启动真实 Chrome
- 使用固定 profile
- 长期保存登录态

适用：
- 当前要先恢复可用的正式发布能力
- 对风控和稳定性要求较高
- 不要求严格复用“用户当前正在看的那一个窗口”

---

### 模式 2：`attach-current-browser`
含义：
- 连接 `remote-debugging-port`
- attach 到现有 Chrome 会话
- 在现有浏览器里新开 tab

适用：
- 用户明确要求“调用我现在的浏览器”
- 已确认本机 Chrome 的 CDP target 完整可用
- attach 专用实现已完成

---

## 6. 对 `jimeng-ui` 的实际建议

### 6.1 短期建议
先让 `jimeng-ui` 的发布恢复到：
- `persistent-profile` 模式为默认
- `attach-current-browser` 模式为实验/可选模式

原因：
- 历史有现成可参考实现
- 成本最低
- 最容易先恢复业务可用性

---

### 6.2 中期建议
在 `write_publish_json(...)` 生成的配置中，未来可增加：

```json
{
  "mode": "persistent-profile",
  "videoPath": "...",
  "title": "...",
  "description": "...",
  "tags": ["..."],
  "coverPath": "..."
}
```

后续再支持：
- `mode = "attach-current-browser"`
- `cdpUrl = "http://127.0.0.1:9222"`

这样外部发布脚本可依据配置走不同路径。

---

## 7. 一句话给后续开发工具

如果你是接手开发此项目的工具，请先记住：

- **历史已验证成功的，是固定已登录 profile 的真实 Chrome 模式**
- **用户现在想要的，是 attach 当前正在使用的浏览器模式**
- **这两者不是一回事，不能混着实现**
- **当前优先级应是先恢复 persistent-profile 模式，再单独攻克 attach-current-browser 模式**

---

## 8. 相关文件索引

项目内：
- `/Users/mac/Desktop/项目总表/jimeng-ui/docs/DOUYIN_PUBLISH_FLOW.md`
- `/Users/mac/Desktop/项目总表/jimeng-ui/docs/WORKFLOW.md`
- `/Users/mac/Desktop/项目总表/jimeng-ui/ui/jimeng_ui_app.py`

外部发布链路：
- `/Users/mac/.agents/skills/douyin-creator-tools/src/auth-douyin.mjs`
- `/Users/mac/.agents/skills/douyin-creator-tools/src/publish_now.mjs`
- `/Users/mac/.agents/skills/douyin-creator-tools/src/publish-douyin-video.mjs`
- `/Users/mac/.agents/skills/auto-douyin-video/scripts/publish-video.mjs`

排查辅助文件：
- `/Users/mac/.openclaw/workspace/douyin_publish.log`
- `/Users/mac/.openclaw/workspace/test_douyin_publish.json`
- `/Users/mac/.openclaw/workspace/attach_cdp_issue_note.txt`
