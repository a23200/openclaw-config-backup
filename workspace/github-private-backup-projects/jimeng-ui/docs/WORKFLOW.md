# 工作流说明

## A. 生成链路
1. text2image 生成首帧（固定 9:16）
2. image2image 生成尾帧（固定 9:16）
3. frames2video / multimodal2video 生成视频（固定 9:16）
4. query_result 下载视频

## B. 后处理策略层
### 自动判断
- 解说/口播/观点类 -> 解说模式（`NarratedStrategy`）
- 情绪片/电影感/空镜类 -> 点题字幕模式（`ThemeSubtitleStrategy`）
- 其他 -> 纯画面模式（`PureVisualStrategy`）

### 当前代码结构
- `ui/postprocess/base.py`：策略接口与结果模型
- `ui/postprocess/narration.py`：旁白文案与音色入口
- `ui/postprocess/subtitle_sync.py`：Whisper / SRT / ASS
- `ui/postprocess/burn_subtitles.py`：硬字幕烧录与降级
- `ui/postprocess/audio_mix.py`：音频挂接
- `ui/postprocess/strategies/`：各模式策略实现

### 纯画面模式
- 不加旁白
- 不强制字幕
- 直接交付 `final_mastered.mp4`

### 点题字幕模式
- 不加旁白
- 只加少量字幕
- 优先硬字幕烧录，失败则降级为外挂字幕版本

### 解说模式
- 生成旁白文案
- 选择音色并生成旁白音频
- Whisper 转字幕
- 字幕对齐
- 合成带旁白视频
- 字幕烧录 / 降级交付

## C. 发布链路
- 生成 `douyin_publish.json`
- 调用抖音发布脚本

## D. 当前已知边界
- 当前机器 ffmpeg 无 `subtitles/ass` filter
- 因此硬字幕烧录需备用方案（例如自绘字幕）
- 即梦 CLI 无独立 AI 音效命令
- `multimodal2video --audio` 可作为高级参考模式
