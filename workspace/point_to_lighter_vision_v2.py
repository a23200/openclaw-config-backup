from pymycobot import MyCobot
import time

PORT = '/dev/cu.usbserial-54F70030501'
BAUD = 115200

# 基于新的视觉检测和修正后的比例尺，计算出的打火机坐标
target_coords = [254.5, -18.7, 95.8, -177.36, -7.15, 134.98]

print("✅ 连接机械臂...")
mc = MyCobot(PORT, BAUD)
time.sleep(1)

print(f"🎯 正在基于最新视觉检测结果，移动到打火机坐标: {target_coords}")
mc.send_coords(target_coords, 30, 0)
time.sleep(4)

print("✅ 已到达目标位置，锁定姿态。")
