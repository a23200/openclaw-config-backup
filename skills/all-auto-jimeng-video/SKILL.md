---
name: all-auto-jimeng-video
description: 全自动生成即梦（Dreamina）短视频技能（首尾帧高级模式）。只需提供一个话题（如“网络热梗”），大模型将自动生成剧本，并调用 Dreamina 依次生成每个分镜的首帧图和尾帧图，再利用 frames2video 进行高质量视频过渡，最后完成配音、混音与字幕烧录。
---

# Auto Jimeng Video Skill (Advanced First/Last Frame Mode)

This skill automates the entire process of creating a high-end short vertical video from a simple topic using the **Dreamina CLI** (即梦) and its advanced `frames2video` mode.

## Description

The process follows an AI-driven, highly controllable "text -> text2image (first & last) -> frames2video" workflow:

1. **Script Generation (OpenAI)**: You provide a topic. The script uses `gpt-4-turbo-preview` to write a 4-shot script, complete with scene descriptions, first-frame prompts, last-frame prompts, and transition actions.
2. **Image Generation (Dreamina)**: For each of the 4 shots, it calls `dreamina text2image` **twice** to generate a high-quality 2K `first_frame` and `last_frame`.
3. **Video Generation (Dreamina)**: It calls `dreamina frames2video` by passing the generated first and last frames along with the transition prompt, using the `seedance2.0` model.
4. **Video Concatenation**: Stitch all 4 generated video clips into a single silent video.
5. **Audio Generation & Mixing**:
   - Generate narration using OpenAI TTS (`tts-1-hd` + `nova`).
   - Mix narration with a preset background music using `amix`.
6. **Synced Subtitle Generation (Whisper)**:
   - Run local Whisper transcription to produce timestamped subtitles.
7. **Final Composition**: Burn subtitles into the final video using `ffmpeg`. Output a ready-to-publish vertical MP4.

## Usage

To use this skill, run the script with a topic.

**Command Line:**

```bash
cd ~/.agents/skills/all-auto-jimeng-video
python run.py "打工人的周末日常"
```

## Requirements

- **Dreamina CLI**: Must be installed and logged in (`dreamina login`) with a VIP account.
- **ffmpeg**: Required for audio mixing and subtitle burn-in.
- **openai-whisper**: Required for local synced subtitle generation.
- **API keys**: `OPENAI_API_KEY` configured in the environment.

## Notes

- `frames2video` guarantees that the shot starts exactly at the first frame and ends exactly at the last frame, ensuring maximum control over the visual narrative.
- Each Dreamina generation task is automatically polled up to 10 minutes (`--poll=600`).
