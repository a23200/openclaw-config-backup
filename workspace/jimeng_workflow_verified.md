# 即梦首尾帧 15 秒视频工作流（已验证版）

## 目标

固定流程：

1. `Stage A`：生成 4 份文本产物
   - 首帧提示词
   - 尾帧提示词
   - 视频总提示词
   - 15 秒镜头脚本
2. `Stage B1`：`即梦图片 5.0 lite` 文生图生成首帧
3. `Stage B2`：基于首帧做图生图生成尾帧，锁定人物和场景
4. `Stage C`：`Seedance 2.0 Fast` 首尾帧生成 15 秒视频

## 这次已验证成功的命令链

### 1) 首帧生成

```bash
dreamina text2image \
  --prompt="<FIRST_FRAME_PROMPT>" \
  --ratio=9:16 \
  --resolution_type=2k \
  --poll=60
```

### 2) 下载首帧

从 `text2image` 返回的 `result_json.images[0].image_url` 下载：

```bash
curl -L "<FIRST_FRAME_IMAGE_URL>" -o outputs/first_frame.png
```

### 3) 尾帧生成

```bash
dreamina image2image \
  --images ./outputs/first_frame.png \
  --prompt="<LAST_FRAME_PROMPT>" \
  --resolution_type=2k \
  --poll=60
```

### 4) 下载尾帧

从 `image2image` 返回的 `result_json.images[0].image_url` 下载：

```bash
curl -L "<LAST_FRAME_IMAGE_URL>" -o outputs/last_frame.png
```

### 5) 15 秒视频生成

```bash
dreamina frames2video \
  --first=./outputs/first_frame.png \
  --last=./outputs/last_frame.png \
  --prompt="<VIDEO_PROMPT>" \
  --model_version=seedance2.0fast \
  --duration=15 \
  --video_resolution=720p \
  --poll=120
```

### 6) 查询并下载视频

```bash
dreamina query_result \
  --submit_id=<SUBMIT_ID> \
  --download_dir=./outputs
```

## 已验证成功的结果

- 首帧：成功
- 尾帧：成功
- 视频：成功
- 输出视频规格：`720x1280` / `24fps` / `15.042s`

## 重要经验（必须遵守）

### 1. 先确认，再扣费

正式执行前，必须先给老板看：

- 首帧提示词
- 尾帧提示词
- 视频总提示词
- 15 秒镜头脚本

老板确认后再调用 dreamina。

### 2. 尾帧必须锁比例

这次实际执行里，首帧是 `1440x2560`，尾帧却生成成了 `2560x1440`。
虽然最终视频仍然成功按竖屏收口，但这是风险点。

**后续流程必须增加一条约束：**

- 尾帧提示词里明确写 `9:16 竖屏构图`
- 必要时在尾帧生成后做尺寸校验
- 如果尾帧不是竖屏，直接判定为需要重生

### 3. 一致性约束要写死

尾帧和视频提示词必须显式包含：

- 同一人物
- 同一服装
- 同一场景
- 同一时间氛围
- 不新增人物
- 不改变世界观

### 4. 视频提示词不能只写氛围

必须明确写：

- 起始镜头景别
- 中段镜头运动
- 末段动作推进
- 环境动态
- 人物表情变化
- 首尾衔接要求

## 推荐目录结构

```text
outputs/
  first_frame.png
  last_frame.png
  final_video.mp4
jimeng_stage_a_draft.md
jimeng_workflow_input.template.json
jimeng_workflow_v1.md
jimeng_workflow_verified.md
```

## 下一步建议

把这条链路封装成一个统一入口脚本，例如：

```bash
./run_jimeng_workflow.sh config.json
```

脚本内部顺序：

1. 读配置
2. 生成 Stage A 文本
3. 等确认
4. 跑首帧
5. 跑尾帧
6. 校验比例
7. 跑视频
8. 下载结果
```
