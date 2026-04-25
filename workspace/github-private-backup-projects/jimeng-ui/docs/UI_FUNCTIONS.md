# UI 功能清单

## 1. 首页 / 控制台
- 新建任务
- 查看任务列表
- 查看每个任务状态
- 查看失败原因
- 查看产物路径

## 2. 任务创建区
### 基础字段
- 任务标题
- 首帧提示词
- 尾帧提示词
- 视频提示词

### 视频生成模式
- 标准模式：`frames2video`
- 高级模式：`multimodal2video`
- 参考音频路径（高级模式可选）

### 后处理策略层
- 自动判断
- 纯画面模式
- 点题字幕模式
- 解说模式
- 点题短句输入框

### 发布区
- 抖音标题
- 抖音描述
- 是否自动发布

## 3. 任务详情页
- 当前状态
- submit_id 列表
- 即梦返回结果
- 文件清单
- 错误日志
- 下载入口

## 4. 状态机
- submitted
- first_frame_generating
- first_frame_querying
- last_frame_generating
- last_frame_querying
- video_submitted
- video_queued
- video_querying
- video_ready
- post_processing
- mastered
- publishing
- published
- failed

## 5. 产物管理
- first_frame.png
- last_frame.png
- final.mp4
- subtitles.srt
- subtitles.ass
- final_mastered.mp4
- douyin_publish.json
- douyin_publish.log

## 6. 异常处理
- 即梦 submit 成功但 query 未完成
- 即梦 success 但本地未下载
- 字幕烧录失败
- 发布失败
- 音频参考路径不存在
- 尾帧比例异常
