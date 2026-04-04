from pymycobot import MyCobot
import time
import json

mc = MyCobot('/dev/cu.usbserial-54F70030501', 115200)

print("1. 恢复到 Home...")
with open('/Users/mac/.openclaw/workspace/home_pos.json', 'r') as f:
    home_angles = json.load(f)['home_angles']
mc.send_angles(home_angles, 50)
time.sleep(2)

print("2. 哎呀，指反了！发现前方在画面左侧，烟盒在右侧。")
print("所以我们让底座(J1)转个大弯，转180度，让它面向右边！")

# 现在的 J1 是 home_angles[0] 大概是 1.14 度
# 我们让它转到 180 度附近
target_angles = home_angles.copy()
target_angles[0] = 160 # 底座转半圈
mc.send_angles(target_angles, 40)
time.sleep(3)

print("3. 下降一点点头部 (J4/J5微调) 来“指向”...")
target_angles[4] = target_angles[4] - 30 # 微调俯仰
mc.send_angles(target_angles, 40)
time.sleep(2)

print("完成掉头并指向！")
