import json
import urllib.request

api_key = "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"
url = "https://api.openai.com/v1/audio/speech"
text = "风还是冷的，冬天也没真正走远。她站在山谷里，看着雾散开，看着山脊一点点变绿。原来，春天不是突然来了，是山先醒了。"
payload = {"model": "tts-1", "input": text, "voice": "nova"}
data = json.dumps(payload).encode("utf-8")
req = urllib.request.Request(url, data=data, headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"})
with urllib.request.urlopen(req) as response:
    with open("voiceover_refined.mp3", "wb") as f:
        f.write(response.read())
print("ok")
