---
name: screen-capture
description: Capture a macOS screenshot on demand and, when the surface supports attachments, return/send the resulting image back to the user. Use when the user asks for a computer screenshot, current screen capture, delayed screenshot, or a screenshot of the frontmost window.
metadata:
  {
    "openclaw": {
      "emoji": "🖼️",
      "os": ["darwin"],
      "requires": { "bins": ["screencapture"] }
    }
  }
---

# screen-capture

On-demand macOS screenshot skill for OpenClaw.

Use this skill when the user asks things like:
- "给我截个图"
- "发我电脑截图"
- "截一下当前屏幕"
- "3 秒后截图"
- "把现在屏幕发给我"
- "发张当前电脑界面"
- "截取当前窗口"

## Safety

Screenshots can include private data: messages, passwords, financial information, tokens, or personal files.
Before capturing, get clear confirmation unless the user has already explicitly asked for a screenshot in the current conversation.

## What this skill does

- Captures the full screen, selected window, or a target file path
- Supports optional delay before capture
- Saves the image locally and prints the output path
- Can be used as a building block before sending the image back to the chat

## Commands

### Full-screen screenshot

```bash
bash scripts/capture.sh
```

### Save to a specific path

```bash
bash scripts/capture.sh --output /tmp/openclaw-shot.png
```

### Delayed screenshot

```bash
bash scripts/capture.sh --delay 3
```

### Front window / interactive window selection

```bash
bash scripts/capture.sh --window
```

## Natural-language routing guide

If the user asks for a screenshot in natural language, interpret requests like these as calls to this skill:

- "截个图" / "给我来张截图"
- "发我当前屏幕"
- "把电脑画面发来"
- "3 秒后截图"
- "只截当前窗口"

Map them like this:

- default/full screen → `bash scripts/capture.sh`
- delayed screenshot → `bash scripts/capture.sh --delay N`
- window screenshot → `bash scripts/capture.sh --window`
- explicit save path → `bash scripts/capture.sh --output /path/to/file.png`

## Attachment handoff

After running the script:

1. Read the printed absolute file path.
2. If the active surface supports file/image attachments, attach that PNG in the reply to the user.
3. If direct attachment is not available in the current tool/runtime, tell the user the local output path and that the screenshot was created successfully.

## Notes for the agent

- Default to full-screen screenshot unless the user requested window-only.
- Prefer saving under `/tmp` or the skill `output/` directory.
- After capture, send the produced image file back to the user if the active surface supports attachments.
- If macOS blocks screenshot capture, tell the user to enable Screen Recording permissions for the host app/terminal.
- `screencapture -x` suppresses camera-shutter sound.
- `screencapture -w` lets the operator click a window. That is useful locally, but not ideal for unattended flows.
- For unattended window capture later, integrate Peekaboo or another UI automation tool.
