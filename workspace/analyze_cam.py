import base64
import os
import requests

# Gemini API 配置
API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    print("Error: GEMINI_API_KEY environment variable not set.")
    exit(1)

API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key={API_KEY}"

def encode_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

image_path = "/Users/mac/.openclaw/workspace/cam_test.jpg"
base64_image = encode_image(image_path)

payload = {
    "contents": [{
        "parts": [
            {"text": "请详细描述一下这个摄像头画面里能看到什么？包含机械臂的姿态、位置、桌面上的物品（如有水杯、笔等请特别指出），以及周围的环境。"},
            {
                "inline_data": {
                    "mime_type": "image/jpeg",
                    "data": base64_image
                }
            }
        ]
    }]
}

headers = {'Content-Type': 'application/json'}

try:
    response = requests.post(API_URL, json=payload, headers=headers)
    response.raise_for_status()
    result = response.json()
    print("分析结果:")
    print(result['candidates'][0]['content']['parts'][0]['text'])
except Exception as e:
    print(f"Error analyzing image: {e}")
    if hasattr(e, 'response') and e.response is not None:
        print(e.response.text)
