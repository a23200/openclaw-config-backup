---
name: jimeng-video
description: 通过 OpenClaw 浏览器自动化控制即梦 AI 网页，实现视频生成全流程自动化（上传素材、输入提示词、切换参数、生成、下载）。
license: MIT
---

# 即梦视频生成 Skill

通过 OpenClaw 浏览器自动化控制即梦 AI 网页，实现视频生成的自动化操作。

## 前置条件

1. OpenClaw Gateway 正在运行（端口 18789）
2. Chrome 浏览器已打开即梦网页 `https://jimeng.jianying.com/ai-tool/home?type=video`
3. Chrome 已开启 remote debugging（`chrome://inspect/#remote-debugging` 勾选 Allow）
4. 系统已安装 Node.js 22+（通过 nvm）

## 辅助脚本

脚本与本 SKILL.md 同目录，首次使用时自动定位：

```bash
JIMENG_SH="$(find ~/.claude/skills ~/.codex/skills -name jimeng-browser.sh -path '*/jimeng-video/*' 2>/dev/null | head -1)"
# 如果未通过插件安装，也可手动指定路径：
# JIMENG_SH="/path/to/jimeng-browser.sh"
```

## 操作流程

### 1. 检查连接状态

```bash
$JIMENG_SH status
```

### 2. 获取页面快照

```bash
$JIMENG_SH snapshot ai
```

### 3. 上传参考内容（图片/视频，1-5 个文件）

```bash
# 单个文件
$JIMENG_SH upload /path/to/image.jpg

# 多个文件（最多 5 个，图片+视频混合）
$JIMENG_SH upload /path/to/video.mp4 /path/to/img1.jpg /path/to/img2.png

# 清除已上传的参考素材（重新上传前建议先清除）
$JIMENG_SH clear-refs
```

支持格式：jpg, jpeg, png, webp, bmp, mp4, mov

上传通过 OpenClaw CDP 协议实现（`openclaw browser upload --element`），无需 macOS 辅助功能权限。文件会自动复制到 `/tmp/openclaw/uploads/` 临时目录，上传完成后自动清理。

### 4. 输入提示词

```bash
$JIMENG_SH prompt "你的视频描述提示词"
```

自动查找输入框，清空已有内容，输入新提示词。

### 5. 点击生成

```bash
$JIMENG_SH generate
```

自动查找可用的生成按钮并点击。

### 6. 检查生成结果

```bash
$JIMENG_SH check-result
```

返回结构化状态，供 Claude Code 直接解析（无需看截图）：

```
STATUS: success
MESSAGE: 视频生成成功，可用 list-videos 查看

STATUS: error
ERROR_TYPE: face_detected
MESSAGE: 识别到素材包含人脸信息，请更换素材
```

| STATUS | 含义 |
|--------|------|
| `success` | 生成成功 |
| `error` | 生成失败，见 ERROR_TYPE |
| `generating` | 生成中 |
| `queued` | 排队等待中 |
| `no_task` | 没有生成任务 |

| ERROR_TYPE | 含义 |
|------------|------|
| `face_detected` | 素材包含人脸 |
| `review_rejected` | 视频未通过审核 |
| `text_policy_violation` | 提示词违规 |
| `insufficient_credits` | 积分不足 |
| `server_busy` | 服务繁忙 |

```bash
$JIMENG_SH snapshot ai
$JIMENG_SH screenshot
```

## 完整示例

```bash
JIMENG_SH="$(find ~/.claude/skills ~/.codex/skills -name jimeng-browser.sh -path '*/jimeng-video/*' 2>/dev/null | head -1)"

$JIMENG_SH status
$JIMENG_SH clear-refs
$JIMENG_SH upload /path/to/video.mp4 /path/to/img1.jpg
$JIMENG_SH prompt "一个女孩在樱花树下跳舞，阳光透过花瓣洒落，画面唯美浪漫"
$JIMENG_SH generate
sleep 10
$JIMENG_SH check-result        # 检查生成状态
```

## 其他命令

```bash
$JIMENG_SH click <ref>         # 点击指定元素
$JIMENG_SH wait <文本>          # 等待页面出现指定文本
$JIMENG_SH eval <js表达式>      # 执行 JavaScript
$JIMENG_SH screenshot [full]   # 截图
$JIMENG_SH clear-refs          # 清除所有参考素材
$JIMENG_SH check-result        # 检查最新生成结果
```

## 直接使用 OpenClaw CLI

```bash
source ~/.nvm/nvm.sh && nvm use 22

openclaw browser snapshot --browser-profile user --format ai
openclaw browser click <ref> --browser-profile user
openclaw browser type <ref> "文本" --browser-profile user
openclaw browser press Enter --browser-profile user
openclaw browser screenshot --browser-profile user
openclaw browser evaluate --browser-profile user --fn 'document.title'
```

## 页面默认设置（无需修改）

- 生成类型：视频生成
- 模型：Seedance 2.0
- 参考类型：全能参考
- 画面比例：16:9
- 时长：15s

## 切换输入框设置

```bash
# 切换模型（Seedance 2.0 / Seedance 2.0 Fast / 视频 3.5 Pro 等）
$JIMENG_SH set-model "Seedance 2.0"

# 切换时长（4s ~ 15s）
$JIMENG_SH set-duration 15s

# 切换参考模式（全能参考 / 首尾帧）
$JIMENG_SH set-mode "全能参考"
$JIMENG_SH set-mode "首尾帧"

# 切换画面比例（16:9 / 9:16 / 1:1 / 4:3 / 3:4 / 21:9）
$JIMENG_SH set-ratio "16:9"
```

## 故障排查

| 问题 | 解决方案 |
|------|---------|
| 标签页未连接 | 确认 Chrome 已开启 remote debugging（`chrome://inspect/#remote-debugging`） |
| Gateway 未运行 | 启动 OpenClaw Gateway |
| 上传失败 | 确认文件路径正确，文件格式为 jpg/png/mp4/mov 等 |
| 生成按钮 disabled | 确保已输入提示词 |
| 元素 ref 变化 | 重新 `snapshot` 获取最新 ref |
