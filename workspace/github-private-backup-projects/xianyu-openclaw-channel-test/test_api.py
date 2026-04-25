
import sys
import os
import openai

# Set the correct path to db_manager
# This allows running the script from the workspace root
sys.path.append(os.path.abspath(os.path.dirname(__file__)))
from db_manager import DBManager
from loguru import logger

def test_ai_config():
    """
    Tests the AI reply configuration for the first enabled account in the database.
    """
    import json
    import requests
    db_manager = DBManager()
    
    logger.info("--- 数据库状态审查 ---")

    # 1. 打印所有找到的Cookie
    all_cookies_dict = db_manager.get_all_cookies()
    logger.info(f"1. 找到的所有Cookie账号: {list(all_cookies_dict.keys())}")

    # 2. 打印所有Cookie的状态
    cookie_statuses = db_manager.get_all_cookie_status()
    logger.info(f"2. 所有账号的启用状态: {cookie_statuses}")

    # 3. 计算并打印被认为是“启用”的账号
    enabled_cookies = [
        c_id for c_id in all_cookies_dict.keys()
        if cookie_statuses.get(c_id, True)  # 默认为True
    ]
    logger.info(f"3. 被判断为“已启用”的账号: {enabled_cookies}")
    
    if not enabled_cookies:
        logger.error("数据库中没有找到任何启用的闲鱼账号。")
        return

    target_cookie_id = enabled_cookies[0]
    logger.info(f"4. 准备测试第一个启用的账号: {target_cookie_id}")

    # 5. 打印该账号的AI配置
    ai_config = db_manager.get_ai_reply_settings(target_cookie_id)
    logger.info("5. 读取到的AI配置如下:")
    # 为了安全，隐藏API Key
    safe_config = ai_config.copy()
    if 'api_key' in safe_config and safe_config['api_key']:
        safe_config['api_key'] = f"****{safe_config['api_key'][-4:]}"
    logger.info(json.dumps(safe_config, indent=2, ensure_ascii=False))
    
    logger.info("--- 审查结束 ---")

    if not ai_config or not ai_config.get('ai_enabled'):
        logger.error(f"账号 {target_cookie_id} 没有启用AI回复或没有配置。")
        return
    
    # 后续的API连通性测试...
    base_url = ai_config.get('base_url')
    api_key = ai_config.get('api_key')
    model_name = ai_config.get('model_name')
    
    if not all([base_url, api_key, model_name]):
        logger.error(f"账号 {target_cookie_id} 的AI配置不完整 (URL, Key, 或模型名称缺失)。")
        return
        
    logger.info("AI配置完整，开始进行API连通性测试...")
    
    # 兼容 qwen 的 v1 路径
    if 'aliyuncs.com' in base_url and not base_url.endswith(('/v1', '/v1/')):
        base_url = base_url.rstrip('/') + '/v1'
    
    url = f"{base_url.rstrip('/')}/chat/completions"
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Say this is a test."}
        ],
        "max_tokens": 50
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=20)
        response.raise_for_status()
        result = response.json()
        
        reply = result.get('choices', [{}])[0].get('message', {}).get('content', '')
        
        logger.success("🎉 API 连通性测试成功！🎉")
        logger.success(f"模型返回: {reply.strip()}")
        
    except requests.exceptions.HTTPError as e:
        logger.error(f"❌ API 请求失败 (HTTP Error): {e.response.status_code} - {e.response.text}")
    except requests.exceptions.RequestException as e:
        logger.error(f"❌ API 请求失败 (Connection Error): {e}")
    except Exception as e:
        logger.error(f"❌ 测试过程中发生未知错误: {e}")

if __name__ == "__main__":
    # Ensure the script is run with the correct context
    # by changing to the script's directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    test_ai_config()
