import os
import sys
import urllib.request
import json

api_key = "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"
url = "https://api.openai.com/v1/audio/speech"

text = "我以为这里什么都没有了，原来，希望还在。"

data = json.dumps({
    "model": "tts-1",
    "input": text,
    "voice": "nova"
}).encode("utf-8")

req = urllib.request.Request(url, data=data, headers={
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
})

try:
    with urllib.request.urlopen(req) as response:
        with open("/Users/mac/.openclaw/workspace/outputs/voiceover.mp3", "wb") as f:
            f.write(response.read())
    print("Voiceover generated successfully.")
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
