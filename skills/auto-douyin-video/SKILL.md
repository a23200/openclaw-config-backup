# 自动抖音视频生成与发布 (Auto Douyin Video)

## 技能描述
这是一个全自动工作流技能：接收老板的指令（主题或具体剧本），调用顶尖视频生成模型（Veo 3.1 等），利用微软 Edge TTS 和高配版 FFmpeg 自动生成带超高清男声配音与**内嵌硬字幕**的高质量短视频（.mp4），最后通过 Playwright 自动将其发布到抖音创作者服务中心。

## 工作流程

1.  **明确需求与剧本拆解**
2.  **调用视频生成接口 (Veo 3.1)**
3.  **合成高清 AI 配音与硬字幕烧录 (Edge TTS + FFmpeg Full)**
    *   调用 `composite-video.js` 生成微软晓晓/云希等超逼真男声配音。
    *   自动生成 `.srt` 字幕文件。
    *   调用 macOS 满血版 `ffmpeg-full`，使用 `subtitles` 和 `drawtext` 滤镜，将新闻大标题和随语音滚动的字幕**像钢铁一样死死焊在视频画面上**。
4.  **自动发布至抖音 (Video Upload)**
    *   调用基于 Playwright 的发布脚本（带全套防弹窗、防闪退保护）。

## 目录结构
- `scripts/generate-video.js` (视频大模型生成)
- `scripts/composite-video.js` (配音、生成字幕文件、全特效烧录合成)
- `scripts/publish-video.mjs` (自动化发布)