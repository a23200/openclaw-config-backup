"""
测试闲鱼聊天记录API
"""
import asyncio
import aiohttp
import json
from db_manager import db_manager

async def test_chat_list_api():
    """测试获取聊天列表API"""
    
    # 获取第一个账号的cookie
    cookies = db_manager.get_all_cookies(1)
    if not cookies:
        print("没有找到账号")
        return
    
    cookie_id = list(cookies.keys())[0]
    cookie_str = cookies[cookie_id]
    
    print(f"使用账号: {cookie_id}")
    
    # 尝试几个可能的API
    apis = [
        # 聊天会话列表
        "https://h5api.m.goofish.com/h5/mtop.taobao.idlemessage.conversation.list/1.0/",
        "https://h5api.m.goofish.com/h5/mtop.taobao.idle.message.list/1.0/",
        "https://h5api.m.goofish.com/h5/mtop.taobao.idlemessage.pc.conversation.list/1.0/",
        # 聊天消息历史
        "https://h5api.m.goofish.com/h5/mtop.taobao.idlemessage.message.list/1.0/",
        "https://h5api.m.goofish.com/h5/mtop.taobao.idle.chat.history/1.0/",
    ]
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': cookie_str,
        'Referer': 'https://www.goofish.com/',
    }
    
    async with aiohttp.ClientSession() as session:
        for api_url in apis:
            print(f"\n测试API: {api_url}")
            try:
                # 尝试GET请求
                async with session.get(api_url, headers=headers, timeout=10) as resp:
                    print(f"状态码: {resp.status}")
                    text = await resp.text()
                    print(f"响应: {text[:200]}")
                    
                    if resp.status == 200:
                        try:
                            data = json.loads(text)
                            print(f"JSON数据: {json.dumps(data, indent=2, ensure_ascii=False)[:500]}")
                        except:
                            pass
            except Exception as e:
                print(f"错误: {e}")

if __name__ == "__main__":
    asyncio.run(test_chat_list_api())
