from pymycobot import MyCobot
import time

PORT = '/dev/cu.usbserial-54F70030501'
BAUD = 115200

# 经过用户校准后的，已知正确的打火机坐标
target_coords = [187.3, -77.9, 93.2, -176.55, -7.82, 134.71]

print("✅ 连接机械臂...")
mc = MyCobot(PORT, BAUD)
time.sleep(1)

print(f"🎯 正在一步到位移动到打火机坐标: {target_coords}")
mc.send_coords(target_coords, 30, 0)
time.sleep(4)

print("✅ 已到达目标位置，锁定姿态。")
