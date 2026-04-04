from pymycobot import MyCobot
import time
import json
import sys

# 1. 连接机械臂
mc = MyCobot('/dev/cu.usbserial-54F70030501', 115200)

print("🚀 步骤1: 恢复到 Home 基准姿势 (防止电机软化掉高)...")
try:
    with open('/Users/mac/.openclaw/workspace/home_pos.json', 'r') as f:
        home_angles = json.load(f)['home_angles']
    mc.send_angles(home_angles, 50)
    time.sleep(2)
except Exception as e:
    print(f"❌ 读取 Home 位置失败: {e}")
    sys.exit(1)

coords = [-1]
while coords == [-1] or not coords:
    coords = mc.get_coords()
    time.sleep(0.1)

print(f"📍 Home 坐标: {coords}")

# 2. 计算指向烟盒的坐标
# 经过视觉测试，烟盒位于 Home 坐标的 X前方(+90) 和 Y右侧(-90)
target_x = coords[0] + 90
target_y = coords[1] - 90
target_z = coords[2] - 10 # 按照要求下降10mm

print(f"🎯 步骤2: 平移向烟盒上方 (X: {target_x}, Y: {target_y})...")
mc.send_coord(1, target_x, 40)
time.sleep(1)
mc.send_coord(2, target_y, 40)
time.sleep(1)

print(f"⬇️ 步骤3: 抓夹下降 10mm 进行“指向” (Z: {target_z})...")
mc.send_coord(3, target_z, 40)
time.sleep(1)

print("✅ 指向动作完成！")
