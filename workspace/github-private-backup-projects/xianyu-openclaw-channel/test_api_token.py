"""测试API"""
import requests
import json

# 登录获取token
login_data = {
    "username": "admin",
    "password": "admin123"
}

response = requests.post('http://localhost:8080/login', json=login_data)
print(f"登录响应: {response.status_code}")
result = response.json()

if result.get('success'):
    token = result['token']
    print(f"✅ 登录成功! Token: {token[:30]}...")
    
    # 测试获取聊天记录
    headers = {'Authorization': f'Bearer {token}'}
    response = requests.get('http://localhost:8080/api/conversations?page=1&page_size=5', headers=headers)
    print(f"\n聊天记录响应: {response.status_code}")
    data = response.json()
    print(f"聊天记录数据: {json.dumps(data, indent=2, ensure_ascii=False)}")
    
    if data.get('success'):
        print(f"\n✅ API返回成功!")
        print(f"总记录数: {data.get('total', 0)}")
        print(f"当前页记录数: {len(data.get('data', []))}")
        
        if data.get('data'):
            print(f"\n前3条聊天记录:")
            for conv in data['data'][:3]:
                print(f"  - [{conv['role']}] {conv['content'][:50]}")
        else:
            print(f"\n❌ data数组为空")
    else:
        print(f"\n❌ API返回失败")
