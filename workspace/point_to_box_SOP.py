from pymycobot import MyCobot
import time

PORT = '/dev/cu.usbserial-54F70030501'
BAUD = 115200

# 从 MEMORY.md 教学样本中读取的坐标
# 指向烟盒上方约50mm
target_coords = [167.5, -56.9, 95.8, -177.36, -7.15, 134.98]

print("✅ 连接机械臂...")
mc = MyCobot(PORT, BAUD)
time.sleep(1)

print(f"🎯 正在移动到目标坐标: {target_coords}")
# 使用相对较慢的速度 30，保证平稳
mc.send_coords(target_coords, 30, 0)
time.sleep(4) # 等待移动完成

print("✅ 已到达目标位置，锁定姿态。")
