from pymycobot import MyCobot
import time
import json

mc = MyCobot('/dev/cu.usbserial-54F70030501', 115200)

print("1. 回复 Home...")
with open('/Users/mac/.openclaw/workspace/home_pos.json', 'r') as f:
    home_angles = json.load(f)['home_angles']
mc.send_angles(home_angles, 50)
time.sleep(2)

coords = [-1]
while coords == [-1] or not coords:
    coords = mc.get_coords()
    time.sleep(0.1)

# 烟盒在画面的右下方（相对底座）
# 机械臂目前朝向大概是 X+, Y-
# 我们让它往 X 方向再伸一点，Y 方向再往右偏一点，并且 Z 下降 10mm
target_x = coords[0] + 40
target_y = coords[1] - 40
target_z = coords[2] - 10

print("2. 移动到烟盒上方并下降 10mm...")
mc.send_coord(1, target_x, 40)
time.sleep(1)
mc.send_coord(2, target_y, 40)
time.sleep(1)
mc.send_coord(3, target_z, 40)
time.sleep(1)

# 稍微调整手腕让抓夹向下“指”
# 假设 Rx/Ry 可以微调指向
# mc.send_coord(4, coords[3] - 20, 30)
# time.sleep(1)

print("完成指向！")
