# screen-capture

This skill captures macOS screenshots on demand.

## Quick test

```bash
bash skills/screen-capture/scripts/capture.sh
```

## Examples

```bash
bash skills/screen-capture/scripts/capture.sh --delay 3
bash skills/screen-capture/scripts/capture.sh --output /tmp/current-screen.png
bash skills/screen-capture/scripts/capture.sh --window
```

## Natural-language examples

These should route naturally to the skill:

- 给我截个图
- 发我当前电脑屏幕
- 3 秒后截图
- 截一下当前窗口

## Expected output

The script prints the absolute path to the generated PNG file.

## Attachment behavior

Preferred flow:
1. Run the capture script
2. Take the printed file path
3. Attach the image in the chat reply if the surface supports attachments

If the current runtime cannot attach files directly, return the saved path and report that the image was created locally.

## macOS permissions

If capture fails, enable **Screen Recording** permission for the host terminal/app that runs OpenClaw.
