import base64
import json
from openai import OpenAI
from pathlib import Path
from utils import load_keys

PROMPTS_DIR = Path(__file__).resolve().parent / 'prompts'

def get_vlm_prompt():
    with open(PROMPTS_DIR / 'vision_grounding_prompt.md', 'r', encoding='utf-8') as f:
        return f.read()

def get_base64_image(image_path: str):
    with open(image_path, "rb") as img:
        return base64.b64encode(img.read()).decode("utf-8")

def find_target_coordinates(image_path: str, instruction: str):
    """
    传图和大模型指令，返回起始和终止目标的框选像素坐标。
    此处示范使用 OpenAI 接口，如果想换 qwen-vl / gemini 都行。
    """
    keys = load_keys()
    client = OpenAI(api_key=keys.get("OPENAI_API_KEY"))

    print(f"正在用大视觉模型识别: {instruction}")
    b64_img = get_base64_image(image_path)
    
    response = client.chat.completions.create(
        model="gpt-4o",  # 默认使用 4o 识图，也可以切别的 VLM
        messages=[
            {"role": "system", "content": get_vlm_prompt()},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": instruction},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64_img}"}}
                ]
            }
        ],
        response_format={"type": "json_object"}
    )
    
    try:
        content = response.choices[0].message.content
        if not content:
            print("VLM 返回内容为空！")
            return {}
        return json.loads(content)
    except Exception as e:
        print("VLM 返回的框选 JSON 解析失败:", e)
        print("原始返回对象:", response)
        return {}

if __name__ == "__main__":
    # 测试的话得造个假图
    print("vision_grounding_prompt 接口骨架已搭建。待接真图片运行。")