# 即梦首尾帧 15 秒视频工作流（v1）

## 目标

按以下固定链路执行：

1. 用 `即梦图片 5.0 lite` 生成首帧
2. 基于 `首帧 + 剧本` 生成尾帧，锁定人物、场景、风格一致性
3. 将 `首帧 + 尾帧 + 详细视频提示词` 提交给 `Seedance 2.0 Fast`
4. 生成 `15s` 成片
5. 正式执行前，必须先把剧本和提示词交给老板确认

## 执行原则

- 不直接开跑，先确认
- 尾帧不是重画一个新世界，而是在首帧基础上推进剧情
- 视频提示词必须具体，不能只写抽象氛围词
- 必须显式写出人物一致性、服装一致性、场景一致性、时间氛围一致性
- 默认优先 `9:16`，如老板指定其他比例再改

## 三阶段结构

### Stage A - 剧本与提示词生成

产出 4 个核心字段：

- `first_frame_prompt`
- `last_frame_prompt`
- `video_prompt`
- `shot_plan`

其中：

- `first_frame_prompt`：首帧静态构图，重点写人物、服装、环境、光线、构图、镜头景别
- `last_frame_prompt`：尾帧延续同一人物和场景，只推进动作、表情、情绪与局部环境变化
- `video_prompt`：给 `Seedance 2.0 Fast` 的完整视频描述，强调首尾过渡、动作连续、镜头节奏、环境动态
- `shot_plan`：按时间段拆镜头，建议固定四段：`0-3s`、`3-7s`、`7-11s`、`11-15s`

### Stage B - 首尾帧生成

#### B1. 首帧

- 模型：`即梦图片 5.0 lite`
- 模式：文生图
- 输出：`first_frame.png`

#### B2. 尾帧

- 模型：`即梦图片 5.0 lite`
- 模式：图生图 / 基于首帧继续生成
- 输入：`first_frame.png`
- 输出：`last_frame.png`

尾帧提示词必须包含以下约束：

- 与首帧为同一主角
- 与首帧为同一套服装和造型
- 与首帧为同一地点、同一世界观、同一时间氛围
- 只改变动作推进、镜头位置、情绪状态或局部环境动态

### Stage C - 视频生成

- 模型：`Seedance 2.0 Fast`
- 模式：首尾帧
- 时长：`15s`
- 比例：默认 `9:16`
- 输入：`first_frame.png` + `last_frame.png` + `video_prompt`
- 输出：`final_video.mp4`

## 人工确认闸门

在进入 Stage B / C 之前，必须先给老板看这几项：

- 主题摘要
- 首帧提示词
- 尾帧提示词
- 视频提示词
- 15 秒镜头拆解

只有老板明确回复“可以”“执行”“开跑”之类确认词，才允许真正调用即梦和 Seedance。

## 推荐输入模板

见 `jimeng_workflow_input.template.json`。

## 现有 CLI 能力对接

根据现有 `jimeng-browser.sh`，已知可复用的视频侧能力：

- `set-mode "首尾帧"`
- `set-model "Seedance 2.0 Fast"`
- `set-duration 15s`
- `set-ratio "9:16"`
- `upload <文件...>`
- `prompt "..."`
- `generate`
- `check-result`
- `list-videos`
- `download-video`

## 当前建议

先做一个“只产出 Stage A 文本结果 + 等老板确认”的入口。
确认后再接首尾帧出图与视频生成，避免直接扣费和反复返工。
