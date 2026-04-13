# 即梦视频生成 Skill（Claude Code Plugin）

通过 OpenClaw 浏览器自动化控制即梦 AI 网页，实现视频生成的全流程自动化。

## 安装

将本目录作为 Claude Code plugin 安装，或直接将 `skills/jimeng-video/` 目录放入项目中。

## 前置条件

1. OpenClaw Gateway 正在运行（端口 18789）
2. Chrome 已打开即梦网页：`https://jimeng.jianying.com/ai-tool/home?type=video`
3. Chrome 已开启 remote debugging（`chrome://inspect/#remote-debugging` 勾选 Allow）
4. 已安装 Node.js 22+（通过 nvm）
5. 已安装 `openclaw` CLI

```bash
# 通过插件安装后自动定位脚本
JIMENG_SH="$(find ~/.claude/skills ~/.codex/skills -name jimeng-browser.sh -path '*/jimeng-video/*' 2>/dev/null | head -1)"
```

---

## 命令速查

| 命令 | 参数 | 说明 |
|------|------|------|
| `status` | — | 查看即梦标签页连接状态 |
| `snapshot` | `[ai\|aria]` | 获取页面无障碍树快照，默认 ai 格式 |
| `screenshot` | `[full]` | 截图，加 full 截全页 |
| `upload` | `<文件...>` | 上传 1-5 个参考文件 |
| `clear-refs` | — | 清除输入区所有已上传参考素材 |
| `prompt` | `<提示词>` | 输入视频生成提示词 |
| `set-model` | `<模型名>` | 切换生成模型 |
| `set-duration` | `<时长>` | 切换视频时长 |
| `set-ratio` | `<比例>` | 切换画面比例 |
| `set-mode` | `<模式>` | 切换参考模式 |
| `generate` | — | 点击生成按钮 |
| `check-result` | — | 检查最新任务生成状态（结构化输出） |
| `list-videos` | — | 列出页面上所有可下载的视频 |
| `download-video` | `[idx] [目录]` | 下载指定视频到本地 |
| `click` | `<ref>` | 点击指定元素（ref 从 snapshot 获取） |
| `wait` | `<文本> [超时ms]` | 等待页面出现指定文本，默认 60s |
| `eval` | `<JS表达式>` | 在页面执行 JavaScript |

---

## 功能详解

### 状态与调试

```bash
$JIMENG_SH status          # 查看标签页连接状态
$JIMENG_SH snapshot        # 获取 AI 格式无障碍树（用于找元素 ref）
$JIMENG_SH snapshot aria   # 获取 ARIA 格式快照
$JIMENG_SH screenshot      # 截图（让 Claude Code 看图判断页面状态）
$JIMENG_SH screenshot full # 截全页
```

### 上传参考素材

支持格式：jpg / jpeg / png / webp / bmp / mp4 / mov，最多 5 个文件。

```bash
$JIMENG_SH upload /path/to/video.mp4
$JIMENG_SH upload /path/to/img1.jpg /path/to/img2.png /path/to/video.mp4
$JIMENG_SH clear-refs      # 清除所有已上传素材
```

上传通过 OpenClaw CDP 协议实现，无需 macOS 辅助功能权限。

### 输入提示词

```bash
$JIMENG_SH prompt "一个女孩在樱花树下跳舞，阳光透过花瓣洒落，画面唯美浪漫"
```

自动找到输入框，清空旧内容，输入新提示词。

### 切换生成参数

默认值：Seedance 2.0 / 全能参考 / 16:9 / 15s

```bash
# 模型（Seedance 2.0 / Seedance 2.0 Fast / 视频 3.5 Pro / 视频 3.0 Pro 等）
$JIMENG_SH set-model "Seedance 2.0"
$JIMENG_SH set-model "Seedance 2.0 Fast"

# 时长（4s ~ 15s）
$JIMENG_SH set-duration 15s
$JIMENG_SH set-duration 5    # 不带 s 也可以

# 参考模式
$JIMENG_SH set-mode "全能参考"   # 上传任意参考素材
$JIMENG_SH set-mode "首尾帧"     # 指定首帧/尾帧

# 画面比例（16:9 / 9:16 / 1:1 / 4:3 / 3:4 / 21:9）
$JIMENG_SH set-ratio "16:9"
$JIMENG_SH set-ratio "9:16"
```

### 生成视频

```bash
$JIMENG_SH generate
```

自动找到可用的生成按钮并点击。需要先输入提示词，否则按钮为 disabled。

### 检查生成状态

```bash
$JIMENG_SH check-result
```

输出结构化状态，Claude Code 可直接 `grep STATUS` 解析，无需看截图：

| STATUS | 含义 |
|--------|------|
| `success` | 生成成功，可用 `list-videos` 下载 |
| `error` | 失败，附带 `ERROR_TYPE`（face_detected / review_rejected / text_policy_violation / insufficient_credits / server_busy） |
| `generating` | 生成中 |
| `queued` | 排队等待 |
| `no_task` | 没有任务 |

### 下载视频

```bash
# 列出当前页面所有可下载的视频
$JIMENG_SH list-videos
# 输出示例:
#   可下载的视频 (2 个):
#   [0] 近未来，人类为躲避氦闪...
#   [1] 淡入星空，银河璀璨...

# 下载指定索引的视频（默认下载到 ~/Documents）
$JIMENG_SH download-video 0
$JIMENG_SH download-video 1 /path/to/save/dir
```

下载通过 curl 直接获取 video.src URL，文件名格式：`jimeng-{日期}-{随机ID}-{提示词}.mp4`。

### 底层操作

```bash
$JIMENG_SH click e1234              # 点击 ref=e1234 的元素
$JIMENG_SH wait "生成完成" 120000   # 等待文字出现，超时 120s
$JIMENG_SH eval 'document.title'    # 执行 JS
```

---

## 典型工作流

### 纯文字生成

```bash
$JIMENG_SH set-model "Seedance 2.0"
$JIMENG_SH set-duration 15s
$JIMENG_SH set-ratio "16:9"
$JIMENG_SH prompt "近未来城市夜景，霓虹灯倒映在雨后的街道上"
$JIMENG_SH generate
# 等待生成...
$JIMENG_SH screenshot              # 看图确认是否完成
$JIMENG_SH list-videos
$JIMENG_SH download-video 0 ~/Desktop
```

### 图片/视频参考生成

```bash
$JIMENG_SH clear-refs
$JIMENG_SH set-mode "全能参考"
$JIMENG_SH upload /path/to/ref.jpg
$JIMENG_SH prompt "根据图片生成动态视频，保持画面风格"
$JIMENG_SH generate
```

### 首尾帧模式

```bash
$JIMENG_SH set-mode "首尾帧"
$JIMENG_SH upload /path/to/start.jpg  # 首帧
# 在页面上手动指定尾帧，或再上传
$JIMENG_SH prompt "从起始画面平滑过渡到结束画面"
$JIMENG_SH generate
```

---

## 故障排查

| 问题 | 解决方案 |
|------|---------|
| 标签页未连接 | 确认 Chrome 已开启 remote debugging（`chrome://inspect/#remote-debugging`） |
| Gateway 未运行 | 启动 OpenClaw Gateway |
| 上传失败 | 确认文件路径正确，格式为 jpg/png/mp4/mov 等 |
| 生成按钮 disabled | 确保已输入提示词 |
| set-model 找不到选项 | 用 `snapshot` 确认页面上的模型名称拼写 |
| download-video 失败 | 视频可能还在生成中，用 `list-videos` 确认有可用视频 |
