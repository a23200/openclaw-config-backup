
from pymycobot import MyCobot
import time
import sys

# 机械臂连接信息
PORT = '/dev/tty.usbserial-54F70030501'
BAUD = 115200

# 目标坐标 (X, Y)，由视觉计算得出
TARGET_X = 48
TARGET_Y = 84.7

# 1. 连接机械臂
print(f"🔗 正在连接机械臂: {PORT}...")
try:
    mc = MyCobot(PORT, BAUD)
    time.sleep(2) # 等待连接稳定
except Exception as e:
    print(f"❌ 连接失败: {e}")
    sys.exit(1)

print("✅ 连接成功！")

# 2. 获取当前坐标，以保持Z轴高度不变
print("🔍 正在读取当前坐标...")
try:
    current_coords = mc.get_coords()
    if not current_coords:
        print("❌ 读取当前坐标失败，请检查机械臂连接。")
        sys.exit(1)
    current_z = current_coords[2]
    print(f"🔩 当前坐标: {current_coords}")
    print(f"📏 将保持Z轴高度: {current_z}")
except Exception as e:
    print(f"❌ 读取坐标时发生错误: {e}")
    sys.exit(1)


# 3. 组合最终目标坐标
target_coords = [TARGET_X, TARGET_Y, current_z, -170, 0, -90] # Rx, Ry, Rz 保持常用姿态
speed = 30
mode = 1 # 1 表示 LINE 模式，直线移动

print(f"🎯 最终目标坐标: {target_coords[:3]}")

# 4. 发送移动指令
print(f"🚀 正在发送移动指令至 (X:{TARGET_X}, Y:{TARGET_Y}, Z:{current_z})...")
mc.send_coords(target_coords, speed, mode)
time.sleep(4) # 等待移动完成

# 5. 验证最终位置
print("🔍 正在验证最终位置...")
final_coords = mc.get_coords()
print(f"✅ 移动完成！最终坐标: {final_coords}")

print("🏁 指向任务完成。")
