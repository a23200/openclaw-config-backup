from pymycobot.mycobot import MyCobot
import time
import sys

PORT = '/dev/tty.usbserial-54F70030501'

try:
    print(f"🔗 正在连接机械臂...")
    mc = MyCobot(PORT, 115200)
    time.sleep(2)

    # 回到一个非奇异点的俯视姿态
    print("👁️ 移动至俯视观察姿态...")
    # [底座旋转, 大臂仰角, 小臂弯曲, 手腕俯仰, 手腕旋转, 手腕偏航]
    mc.send_angles([0, 0, 30, -120, 0, -90], 50) 
    time.sleep(4)
    
    coords = mc.get_coords()
    print(f"✅ 观察姿态就绪。当前基准坐标: {coords}")

except Exception as e:
    print(f"❌ 错误: {e}")
