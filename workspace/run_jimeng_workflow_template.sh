#!/bin/bash
set -euo pipefail

WORKDIR="${1:-$(pwd)}"
OUTPUT_DIR="$WORKDIR/outputs"
mkdir -p "$OUTPUT_DIR"

FIRST_FRAME_PROMPT="${FIRST_FRAME_PROMPT:-}"
LAST_FRAME_PROMPT="${LAST_FRAME_PROMPT:-}"
VIDEO_PROMPT="${VIDEO_PROMPT:-}"

if [[ -z "$FIRST_FRAME_PROMPT" || -z "$LAST_FRAME_PROMPT" || -z "$VIDEO_PROMPT" ]]; then
  echo "请先设置环境变量: FIRST_FRAME_PROMPT / LAST_FRAME_PROMPT / VIDEO_PROMPT"
  exit 1
fi

echo "[1/5] 生成首帧..."
dreamina text2image \
  --prompt="$FIRST_FRAME_PROMPT" \
  --ratio=9:16 \
  --resolution_type=2k \
  --poll=60 | tee "$OUTPUT_DIR/first_frame_result.json"

echo "请从 first_frame_result.json 提取 image_url 并下载到 $OUTPUT_DIR/first_frame.png"
echo "[2/5] 生成尾帧..."
dreamina image2image \
  --images "$OUTPUT_DIR/first_frame.png" \
  --prompt="$LAST_FRAME_PROMPT" \
  --resolution_type=2k \
  --poll=60 | tee "$OUTPUT_DIR/last_frame_result.json"

echo "请从 last_frame_result.json 提取 image_url 并下载到 $OUTPUT_DIR/last_frame.png"
echo "[3/5] 校验首尾帧存在..."
[[ -f "$OUTPUT_DIR/first_frame.png" ]] && [[ -f "$OUTPUT_DIR/last_frame.png" ]]

echo "[4/5] 提交 15 秒视频..."
dreamina frames2video \
  --first="$OUTPUT_DIR/first_frame.png" \
  --last="$OUTPUT_DIR/last_frame.png" \
  --prompt="$VIDEO_PROMPT" \
  --model_version=seedance2.0fast \
  --duration=15 \
  --video_resolution=720p \
  --poll=120 | tee "$OUTPUT_DIR/video_result.json"

echo "[5/5] 完成。请从 video_result.json 获取 submit_id，再用 query_result 下载最终视频。"
