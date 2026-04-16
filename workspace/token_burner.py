import os
import time
import random
from openai import OpenAI

# ==========================================
# ⚙️ 配置区域
# ==========================================
# 填入你的 API KEY
API_KEY = os.getenv("OPENAI_API_KEY", "sk-xxxxxx") 
# 如果你使用的是中转代理、Azure 或其他兼容 OpenAI 格式的 API（如 DeepSeek/Gemini），请修改 Base URL
BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
# 你想消耗 tokens 的模型名称 (比如 gpt-4o, claude-3-5-sonnet, gemini-1.5-pro)
MODEL = "gpt-4o" 

# 每次请求间的休眠时间（秒），防止触发 429 Rate Limit
SLEEP_TIME = 15  

# 话题池：每次随机抽取一个话题让模型生成长文，确保每次生成的都不一样
TOPICS = [
    "量子计算的底层物理原理及其对现代密码学的潜在冲击",
    "罗马帝国的衰落：经济、军事与气候的综合分析",
    "深海热泉生态系统的能量循环与生命起源假说",
    "人工智能在未来三十年内对全球劳动力市场的重塑",
    "火星殖民的生态圈闭环设计与工程伦理挑战",
    "意识的本质：从神经科学到心智哲学的跨学科探讨",
    "印欧语系的演化历程与人类早期迁徙路线的对应关系",
    "可控核聚变的磁约束与惯性约束技术路线对比及商业化前景",
    "文艺复兴时期的美第奇家族对欧洲现代金融与艺术的推动",
    "黑洞信息悖论与霍金辐射的最新理论进展"
]

client = OpenAI(api_key=API_KEY, base_url=BASE_URL)

def burn_tokens():
    print(f"🔥 启动 Token 燃烧器! 目标模型: {MODEL}")
    print(f"📍 Base URL: {BASE_URL}")
    print("-" * 50)
    
    total_prompt_tokens = 0
    total_completion_tokens = 0

    while True:
        topic = random.choice(TOPICS)
        # 构造复杂的 Prompt，强迫模型输出长文
        prompt = (
            f"请撰写一篇关于【{topic}】的深度学术论文。要求：\n"
            "1. 字数不少于3000字（极度详尽）。\n"
            "2. 必须包含：历史背景、核心理论/机制解析、现代技术发展、面临的挑战、未来50年的预测。\n"
            "3. 请使用极其专业、严谨且冗长的学术语言，并提供具体的虚拟案例分析。\n"
            "4. 从多个交叉学科的角度进行深度剖析。"
        )

        try:
            print(f"[{time.strftime('%H:%M:%S')}] 正在生成话题: {topic}...")
            
            # 发起请求
            response = client.chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": "你是一位极其啰嗦、非常喜欢长篇大论、深入探讨每一个细节的顶尖学术研究员。"},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=4000,  # 榨干它的单次输出上限
                temperature=0.8
            )

            # 统计并打印 Token 消耗
            usage = response.usage
            total_prompt_tokens += usage.prompt_tokens
            total_completion_tokens += usage.completion_tokens
            total_burned = total_prompt_tokens + total_completion_tokens
            
            print(f"✅ 完成! 消耗 -> 提问: {usage.prompt_tokens} | 回答: {usage.completion_tokens}")
            print(f"💰 累计已烧毁 Token 总数: {total_burned:,}")
            print("-" * 50)

            # 休眠，避免被封
            time.sleep(SLEEP_TIME)

        except Exception as e:
            print(f"❌ 请求出错: {e}")
            print("等待 30 秒后重试...")
            time.sleep(30)

if __name__ == "__main__":
    burn_tokens()
