---
name: all-auto-douyin-video
description: 全自动生成短视频技能。用户提供固定场景、分镜、旁白和BGM路径，自动执行 DALL-E 画图、Veo 视频生成、OpenAI 配音、混音、Whisper 真同步字幕与烧录，生成用于抖音的 MP4 成片。
---

# Auto Douyin Video Skill (Conversational)

This skill automates the entire process of creating a short vertical video from a structured text script provided in conversation.

## Description

This skill is now a full pipeline for **script → images → video → voiceover → mixed audio → synced subtitles → final MP4**.

The process is as follows:

1. **Script Parsing**: Parse the structured text block into scene, shots, narration, and BGM path.
2. **Text-to-Image**: Generate consistent vertical images with OpenAI DALL-E 3.
3. **Image-to-Video**: Turn each image into a short Veo video segment.
4. **Video Concatenation**: Stitch all segments into a single silent video.
5. **Audio Generation & Mixing**:
   - Generate narration using OpenAI TTS (must use `tts-1-hd` model with `nova` voice for high-quality, natural-sounding voiceover).
   - Mix narration with the provided BGM. **CRITICAL:** Use `amix=inputs=2:duration=longest` (not `duration=first`) to ensure the background music stretches to its full length and prevents the video from being cut short by a brief voiceover.
6. **Synced Subtitle Generation (Whisper)**:
   - Extract final audio.
   - Run local Whisper transcription (`whisper --model base --language zh --output_format srt`) to produce timestamped subtitles. **CRITICAL:** On macOS, ensure `KMP_DUPLICATE_LIB_OK=TRUE` is set in the environment before calling whisper to avoid libomp initialization crashes.
   - Burn subtitles into the final video using `ffmpeg-full` with `-shortest` to crop the BGM track down to the exact duration of the concatenated video.
7. **Final Composition**: Output a ready-to-publish vertical MP4.

## Usage

To use this skill, send a message formatted as a script.

**Required Format:**

```text
固定场景/角色：
[A detailed description of the consistent elements of your scene: character, environment, art style, etc.]

镜头描述：
1. [Description of the specific action or view for the first shot]
2. [Description for the second shot]
3. [And so on...]

旁白文案：
[The full narration text for the entire video]

背景音乐：
[/path/to/your/local/music_file.mp3]
```

The agent handles the rest.

## Requirements

- **ffmpeg-full**: Required for subtitle burn-in via libass.
- **openai-whisper**: Required for local synced subtitle generation.
- **Python virtualenv**: Use the skill's bundled virtual environment when available.
- **API keys**:
  - Preferred location: `/Users/mac/.openclaw/workspace/.env.local`
  - Supported keys:
    - `OPENAI_API_KEY`
    - `GOOGLE_API_KEY`

## Notes

- `run.py` now automatically loads `/Users/mac/.openclaw/workspace/.env.local` before falling back to system environment variables.
- The synced-subtitle workflow is now part of the standard skill capability.
- If subtitle burn-in fails, first verify the active ffmpeg binary is `ffmpeg-full` rather than the minimal Homebrew `ffmpeg` formula.
