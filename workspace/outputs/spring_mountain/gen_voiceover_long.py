import json
import urllib.request
import sys

api_key = "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"
url = "https://api.openai.com/v1/audio/speech"
text = "冬天还没真正退远，风里还带着冷。她站在沉默的山谷里，看着枯草、碎石，还有没有说出口的疲惫。可天光一点点亮起来，雾慢慢散开，山脊先绿了，裂缝里也长出了花。原来，春天不是突然来了。是这座山，先替我们醒来。"

payload = {
    "model": "tts-1",
    "input": text,
    "voice": "nova"
}

data = json.dumps(payload).encode("utf-8")
req = urllib.request.Request(url, data=data, headers={
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
})
try:
    with urllib.request.urlopen(req) as response:
        with open("/Users/mac/.openclaw/workspace/outputs/spring_mountain/voiceover_young_woman_long.mp3", "wb") as f:
            f.write(response.read())
    print("ok")
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
