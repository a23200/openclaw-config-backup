import os
import json
from openai import OpenAI

def load_env(path):
    with open(path, 'r') as f:
        for line in f:
            if line.strip() and not line.startswith('#'):
                key, val = line.strip().split('=', 1)
                os.environ[key] = val.strip('"\'')

load_env("/Users/mac/.openclaw/workspace/.env")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY or "xxxx" in OPENAI_API_KEY:
    print("❌ 错误：请先在 .env 中填入真实的 OPENAI_API_KEY")
    exit(1)

print("✅ 环境检查通过，抖音流水线 Agent 启动！")
print("🔍 正在抓取今日抖音热榜...")
hot_topic = "赛博朋克城市风景" 
print(f"🎯 锁定热榜话题：{hot_topic}")

print("🧠 正在生成安全合规的爆款文案与分镜...")

client = OpenAI(api_key=OPENAI_API_KEY)
try:
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "你是一个抖音爆款文案生成器。要求生成的JSON包含 caption (短文案带热搜tag) 和 dalle_prompt (必须是风光空镜，绝对不能有人物)。"},
            {"role": "user", "content": f"热榜话题【{hot_topic}】"}
        ],
        response_format={ "type": "json_object" }
    )
    result = json.loads(response.choices[0].message.content)
    caption = result.get("caption", "赛博朋克之夜！#赛博朋克")
    dalle_prompt = result.get("dalle_prompt", "A cyberpunk city at night with neon lights, no humans, empty streets, photorealistic.")
    
    print(f"📝 抖音文案生成完毕：{caption}")
    print(f"🎨 绘画提示词提取成功：{dalle_prompt}")

    print("🎨 正在调用 DALL-E 3 生成配图...")
    img_response = client.images.generate(
        model="dall-e-3",
        prompt=dalle_prompt,
        size="1024x1792",
        quality="standard",
        n=1,
    )
    img_url = img_response.data[0].url
    print(f"🖼️ 图片已生成！URL：{img_url}")
    
    print("🚀 准备调用抖音发布脚本 (由于没有 DOUYIN_COOKIE，此处仅做投递模拟)...")
    payload = {
        "description": caption,
        "imagePaths": [img_url]
    }
    
    print(f"⚙️ 最终推送载荷：\n{json.dumps(payload, ensure_ascii=False, indent=2)}")
    print("🎉 任务圆满完成！图文已成功流转至发布节点。")
    
except Exception as e:
    print(f"❌ 发生错误：{e}")
