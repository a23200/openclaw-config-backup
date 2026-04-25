# 工作流说明

## A. 生成链路
1. text2image 生成首帧
2. image2image 生成尾帧
3. frames2video / multimodal2video 生成视频
4. query_result 下载视频

## B. 后处理策略层
### 自动判断
- 解说/口播/观点类 -> 解说模式
- 情绪片/电影感/空镜类 -> 点题字幕模式
- 其他 -> 纯画面模式

### 纯画面模式
- 不加旁白
- 不强制字幕
- 直接交付成片

### 点题字幕模式
- 不加旁白
- 只加少量字幕

### 解说模式
- 生成旁白
- Whisper 转字幕
- 字幕对齐
- 混音导出

## C. 发布链路
- 生成 `douyin_publish.json`
- 调用抖音发布脚本

## D. 当前已知边界
- 当前机器 ffmpeg 无 `subtitles/ass` filter
- 因此硬字幕烧录需备用方案（例如自绘字幕）
- 即梦 CLI 无独立 AI 音效命令
- `multimodal2video --audio` 可作为高级参考模式
