import urllib.request
import urllib.error
import base64
import json
import os
import sys

# Gemini API 配置
API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    print("Error: GEMINI_API_KEY environment variable not set.")
    sys.exit(1)

# 使用 gemini-1.5-flash 会更快，足够做视觉分析了
API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key={API_KEY}"

image_path = "/Users/mac/.openclaw/workspace/cam_test_6.jpg"

try:
    with open(image_path, "rb") as image_file:
        base64_image = base64.b64encode(image_file.read()).decode('utf-8')
except FileNotFoundError:
    print(f"Error: 找不到图片 {image_path}")
    sys.exit(1)

payload = {
    "contents": [{
        "parts": [
            {"text": "这张照片里左侧有一个白色机械臂的夹爪，请仔细看看它的前端方向（开口方向或者尖端方向）是不是指向了画面右下角的烟盒？如果不是，它到底指向了哪里？是左边、上边、还是画面外部？"},
            {
                "inline_data": {
                    "mime_type": "image/jpeg",
                    "data": base64_image
                }
            }
        ]
    }]
}

data = json.dumps(payload).encode('utf-8')
req = urllib.request.Request(API_URL, data=data, headers={'Content-Type': 'application/json'})

try:
    with urllib.request.urlopen(req) as response:
        result = json.loads(response.read().decode('utf-8'))
        print("分析结果:")
        print(result['candidates'][0]['content']['parts'][0]['text'])
except urllib.error.HTTPError as e:
    print(f"HTTP Error {e.code}: {e.read().decode('utf-8')}")
except Exception as e:
    print(f"Error: {e}")
