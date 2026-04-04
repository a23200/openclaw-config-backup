from pymycobot.mycobot import MyCobot
import time
import sys

# ------------------- 配置 -------------------
PORT = '/dev/tty.usbserial-54F70030501'
BAUD = 115200

# 已知能指向烟盒区域的坐标
TARGET_X = 48.0
TARGET_Y = 84.7

# 悬停在物体上方的高度 (估算值)
TARGET_Z = 280.0

# 保持垂直向下的手腕姿态
TARGET_WRIST_POSE = [-170.0, 0.0, -90.0]

# ------------------- 主程序 -------------------
mc = None
try:
    print(f"🔗 正在连接机械臂: {PORT}...")
    mc = MyCobot(PORT, BAUD)
    time.sleep(2)
    print("✅ 连接成功！")

    # 组合最终目标坐标
    target_coords = [TARGET_X, TARGET_Y, TARGET_Z] + TARGET_WRIST_POSE
    print(f"🎯 最终目标坐标: {target_coords}")
    
    # 发送直线移动指令
    print(f"🚀 正在发送移动指令...")
    mc.send_coords(target_coords, 35, 1) # mode=1 表示直线移动
    time.sleep(5)

    # 验证最终位置
    print("🔍 正在验证最终位置...")
    final_coords = mc.get_coords()
    print(f"✅ 移动完成！最终坐标: {final_coords}")
    
    print("\n🏁 指向任务完成！")

except Exception as e:
    print(f"❌ 执行过程中发生错误: {e}")
    sys.exit(1)

finally:
    if mc:
        print("🦾 机械臂将保持最终姿态。")

