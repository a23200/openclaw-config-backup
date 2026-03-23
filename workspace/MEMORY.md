# MEMORY.md - Long-Term Context

## User Preferences

* **Content Creation:** 老板明确要求，所有自动化生成的社交媒体内容（特别是抖音文案和相关资讯），**必须是中文**。绝对不能发布英文内容。

## Video Generation & Publishing Workflows

* **核心视频流 (2026-03-21):** 生成纯视觉默片 (Veo 3.1) -> 高清TTS朗读新闻 + FFmpeg Full 版合并音频并**硬烧录带透明底的高级中文字幕**（去掉喧宾夺主的大字水印，且字幕时间轴需精准匹配语速） -> FFMPEG 视频循环拉长以匹配音频 -> Playwright 自动避开所有弹窗并发布。
* **画质与声音标准 (2026-03-23):** Veo 3.1 提示词必须强制加上电影级强化（`cinematic lighting, 8k resolution, photorealistic, ultra-detailed`）；音频采用 Edge TTS (晓晓/云希) 搭配高级硬核 `.srt` 阴影字幕。
* **操作红线 (Playwright):** 禁止在填表单时模拟 `Enter` 键（导致抖音保存退出），必须用 `element.fill()` 或纯物理敲击；遇到弹窗必须有精准的关闭/跳过逻辑；发布时绝对不可使用 `pkill -f "Google Chrome"` 误杀用户的私人浏览器进程。
* **发图文 vs 发文章红线 (2026-03-21):** 绝对不能把“图文”和“文章”发布搞混。发图文必须用 `node ~/.agents/skills/douyin-creator-tools/src/publish-imagetext.mjs`，JSON 载荷包含 `description` 和 `imagePaths` 数组；发文章用 `publish-douyin-article.mjs`，绝不能混用。

## Hardware & Robotics Integration (2026-03-23)

* **机械臂控制流:** 目标是通过 ROS 2 桥接 Elephant Robotics 机械臂，接入视觉（`camsnap`）与语音指令。
* **语音助理状态:** 已完成 `voice_assistant_final.py`，使用 Whisper base 模型进行 Wake Word (“老弟”) + VAD + 语音转文本。通过 `subprocess` 调用 `openclaw system event` 将指令传入系统，实现语音唤醒后的全自动接管。
* **Elephant Robotics 底层控制经验 (2026-03-24):** 
    1. 发现旧版 `pymycobot` 的全坐标群发指令 `send_coords(..., mode=1)` 存在严重的逆运动学畸变（掉高）。对于精准的空间定位和单轴姿态调整，必须抛弃群发，拆分为单轴锁定指令 `send_coord(id, value, speed)`，它能物理死锁其他 5 个自由度走出完美直线（如 Z 轴直降）。
    2. **奇异点死锁警报：** 当机械臂像电线杆一样完全伸直（Z轴到达绝对顶峰 ~420mm）时，姿态旋转 (Rx/Ry) 会因没有关节冗余而失败。**破解方案：必须先下沉 Z 轴至少 10 厘米释放肘部空间，再进行翻转。**
    3. 视觉抓取：直接将 XY 像素差乘上比例尺（如 1mm=1.5px）转化为物理偏移量，然后使用高精度单轴锁定直接 Z 轴下降，摒弃复杂的纯角度猜测。
    4. 兜底方案：开发了 `teach_and_play.py`，遇到死角直接断电变软人工掰姿势，记录角度后一键回放。