
from pymycobot import MyCobot
import time
import sys

# 机械臂连接信息
PORT = '/dev/cu.usbserial-54F70030501'
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

# 2. 获取当前坐标，用于逆运动学计算
print("🔍 正在读取当前坐标...")
try:
    current_coords = mc.get_coords()
    if not current_coords:
        print("❌ 读取当前坐标失败，请检查机械臂连接。")
        sys.exit(1)
    
    # 我们需要当前完整的6自由度坐标 (x, y, z, rx, ry, rz)
    # Z轴使用当前高度，Rx, Ry, Rz也使用当前的姿态
    target_coords_for_ik = [TARGET_X, TARGET_Y, current_coords[2], current_coords[3], current_coords[4], current_coords[5]]

    print(f"🔩 当前坐标: {current_coords}")
    print(f"🎯 用于逆运动学计算的目标三维坐标: {target_coords_for_ik}")

except Exception as e:
    print(f"❌ 读取坐标时发生错误: {e}")
    sys.exit(1)


# 3. 核心：进行逆运动学计算 (Inverse Kinematics)
print("🧠 正在进行逆运动学计算...")
try:
    # get_solution_angles(target_coords, current_angles)
    # 这个函数需要一个当前的角度作为参考解，来找到最近的解
    current_angles = mc.get_angles()
    if not current_angles:
        print("❌ 读取当前角度失败，无法进行逆运动学计算。")
        sys.exit(1)

    target_angles = mc.get_solution_angles(target_coords_for_ik, current_angles)
    
    if not target_angles or len(target_angles) != 6:
        print("❌ 逆运动学无解！目标点可能超出工作范围或姿态无法达到。")
        sys.exit(1)
        
    print(f"💡 计算出的目标关节角度: {target_angles}")

except Exception as e:
    print(f"❌ 逆运动学计算时发生错误: {e}")
    sys.exit(1)


# 4. 发送角度移动指令
speed = 25
print(f"🚀 正在发送角度移动指令...")
mc.send_angles(target_angles, speed)
time.sleep(5) # 等待移动完成

# 5. 验证最终位置
print("🔍 正在验证最终位置...")
final_angles = mc.get_angles()
final_coords = mc.get_coords()
print(f"✅ 移动完成！")
print(f"   - 最终角度: {final_angles}")
print(f"   - 最终坐标: {final_coords}")

print("🏁 指向任务完成。")
