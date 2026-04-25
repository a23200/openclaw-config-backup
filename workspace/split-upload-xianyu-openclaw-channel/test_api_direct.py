"""直接测试API"""
from db_manager import db_manager

# 测试数据库方法
print("测试 get_conversations_by_cookie:")
conversations = db_manager.get_conversations_by_cookie('3083424450', limit=5, offset=0)
print(f"返回记录数: {len(conversations)}")
for conv in conversations[:3]:
    print(f"  - {conv['role']}: {conv['content'][:30]}")

print("\n测试 count_conversations_by_cookie:")
count = db_manager.count_conversations_by_cookie('3083424450')
print(f"总记录数: {count}")

print("\n测试 get_conversations_by_cookies:")
conversations = db_manager.get_conversations_by_cookies(['3083424450'], limit=5, offset=0)
print(f"返回记录数: {len(conversations)}")
