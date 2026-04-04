import json
import os
from pathlib import Path
from openai import OpenAI
from utils import load_keys

PROMPTS_DIR = Path(__file__).resolve().parent / 'prompts'

def get_planner_system_prompt():
    with open(PROMPTS_DIR / 'planner_system_prompt.md', 'r', encoding='utf-8') as f:
        return f.read()

def generate_plan(user_command: str):
    """
    通过大模型（这里以 OpenAI 为例，也可随时切 Gemini2.5-pro），
    把用户指令解析成动作 JSON。
    """
    keys = load_keys()
    client = OpenAI(api_key=keys.get("OPENAI_API_KEY"))

    print(f"[{user_command}] -> 正在请求 LLM 做编排...")
    
    response = client.chat.completions.create(
        model="gpt-4o",  # 视情况可切换模型
        messages=[
            {"role": "system", "content": get_planner_system_prompt()},
            {"role": "user", "content": user_command}
        ],
        response_format={"type": "json_object"}  # 强制 JSON
    )

    try:
        content = response.choices[0].message.content
        return json.loads(content)
    except Exception as e:
        print("大模型吐出的 JSON 解析失败", e)
        return {"functions": [], "response": "解析失败。"}

if __name__ == "__main__":
    plan = generate_plan("先把原点复位，再把那个绿色方块放到猪的头上")
    print("\n--- Planner 输出 ---")
    print(json.dumps(plan, ensure_ascii=False, indent=2))
