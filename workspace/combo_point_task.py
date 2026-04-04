from pymycobot.mycobot import MyCobot
import time
import sys

# ------------------- 配置 -------------------
PORT = '/dev/tty.usbserial-54F70030501'
BAUD = 115200

# Home 姿态的角度 (来自 go_home.py)
HOME_ANGLES = [1.14, 0.43, -4.83, -76.02, 7.55, 133.24]

# 指向任务的目标坐标 (来自 point_to_cigarette.py)
# 注意：我们将动态获取Z轴，并使用固定的手腕姿态
TARGET_X = 48.0
TARGET_Y = 84.7
TARGET_WRIST_POSE = [-170.0, 0.0, -90.0] # Rx, Ry, Rz

# ------------------- 主程序 -------------------
mc = None
try:
    # 1. 一次性连接
    print(f"🔗 正在连接机械臂: {PORT}...")
    mc = MyCobot(PORT, BAUD)
    time.sleep(2)
    print("✅ 连接成功！")

    # 2. 执行回老家逻辑
    print("🏠 正在执行回老家...")
    mc.send_angles(HOME_ANGLES, 70)
    time.sleep(4)
    print("✅ 已回到 Home 位置。")

    # 3. 执行指向任务逻辑
    print("🎯 开始执行指向任务...")
    
    # 3.1 获取当前Z轴高度以保持
    print("   L 正在读取当前坐标以确定Z轴高度...")
    current_coords = mc.get_coords()
    if not current_coords:
        raise ValueError("读取当前坐标失败")
    current_z = current_coords[2]
    print(f"   L 将保持Z轴高度: {current_z}")
    
    # 3.2 组合最终目标坐标
    target_coords = [TARGET_X, TARGET_Y, current_z] + TARGET_WRIST_POSE
    print(f"   L 最终目标坐标: {target_coords}")
    
    # 3.3 发送直线移动指令
    print(f"   L 正在发送移动指令...")
    mc.send_coords(target_coords, 30, 1) # mode=1 表示直线移动
    time.sleep(4)

    # 4. 验证最终位置
    print("🔍 正在验证最终位置...")
    final_coords = mc.get_coords()
    print(f"✅ 移动完成！最终坐标: {final_coords}")
    
    print("\n🏁 所有任务在一个连接内完成！")

except Exception as e:
    print(f"❌ 执行过程中发生错误: {e}")
    sys.exit(1)

finally:
    if mc:
        # 保持姿态，不放松
        print("🦾 机械臂将保持最终姿态。")

