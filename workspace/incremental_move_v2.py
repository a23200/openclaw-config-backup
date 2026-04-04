from pymycobot import MyCobot
import time

PORT = '/dev/cu.usbserial-54F70030501'
BAUD = 115200

# 最终修正版微调
delta_x = 20  # 向下
delta_y = -20 # 向右

print("✅ 连接机械臂...")
mc = MyCobot(PORT, BAUD)
time.sleep(1)

print("🔍 正在读取当前坐标作为基准...")
base_coords = mc.get_coords()
time.sleep(0.5)

if not base_coords:
    print("❌ 读取基准坐标失败，无法执行相对移动。")
    exit()

print(f"📍 基准坐标: {base_coords}")

# 计算目标坐标
target_coords = base_coords[:] # 复制列表
target_coords[0] += delta_x
target_coords[1] += delta_y

print(f"🎯 正在执行最终微调，目标坐标: {target_coords}")
mc.send_coords(target_coords, 15, 0)
time.sleep(2)

print("✅ 已到达目标位置，锁定姿态。")
