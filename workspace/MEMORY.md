# MEMORY.md - Long-Term Context

## User Preferences

* **Content Creation (2026-03-21):** 老板明确要求，所有自动化生成的社交媒体内容（特别是抖音文案和相关资讯），**必须是中文**。绝对不能发布英文内容。
* **Video Generation & Publishing (2026-03-21):** 
  - 核心工作流：生成纯视觉默片 (Veo 3.1) -> 高清TTS朗读新闻 + FFmpeg Full 版合并音频并**硬烧录带透明底的高级中文字幕**（去掉喧宾夺主的大字水印，且字幕时间轴需精准匹配语速） -> FFMPEG 视频循环拉长以匹配音频 -> Playwright 自动避开所有弹窗并发布。
  - **红线**：禁止在 Playwright 填表单时模拟 `Enter` 键（导致抖音保存退出），必须用 `element.fill()` 或纯物理敲击；遇到弹窗必须有精准的关闭/跳过逻辑；发布时绝对不可使用 `pkill -f "Google Chrome"` 误杀用户的私人浏览器进程。