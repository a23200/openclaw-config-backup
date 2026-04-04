# Auto Douyin Video Skill (Conversational)

This skill automates the entire process of creating a short video based on a structured text prompt provided in a conversation.

## Description

This skill is designed to be a powerful, conversational tool. The user provides a multi-part "script" in a single message, and the skill handles the entire creation pipeline from start to finish, including image generation, video animation, audio narration, background music mixing, and final composition.

The process is as follows:

1.  **Script Parsing**: The agent receives a structured text block and parses it to understand the core components of the video.
2.  **Text-to-Image**: It generates a series of high-quality images based on a combination of a fixed "base prompt" and several "variation" prompts, ensuring visual consistency. This step uses the OpenAI DALL-E 3 model.
3.  **Image-to-Video**: Each generated image is animated into a short (5-second) video clip with a subtle zoom effect.
4.  **Video Concatenation**: All video clips are stitched together into a single silent movie.
5.  **Audio Generation & Mixing**: 
    *   A voiceover is generated from the narration text using OpenAI's TTS model.
    *   This voiceover is then professionally mixed with a user-provided background music file. The BGM volume is automatically lowered to ensure the narration is clear.
6.  **Final Composition**: The final audio track and the silent video are merged into a complete, high-quality MP4 video, ready for publishing.

## Usage

To use this skill, simply send a message to the agent formatted as a "script". The agent will recognize the format and automatically start the video creation process.

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

The agent will handle the rest.

## Requirements

- **ffmpeg**: Required for all video and audio processing.
- **Python 3 & Virtual Environment**: The skill runs in its own isolated Python environment.
- **API Keys**: The script `run.py` requires a valid OpenAI API Key to be placed in the designated variable at the top of the file. This key is used for both image and audio generation.
