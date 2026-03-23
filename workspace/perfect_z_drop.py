import time
from pymycobot.mycobot import MyCobot

port = "/dev/tty.usbserial-54F70030501"
baudrate = 115200

if __name__ == "__main__":
    try:
        cobot = MyCobot(port, baudrate)
        print("启动强制锁止垂直下降 (单轴驱动模式)...")

        # 1. 确保抓夹张开
        cobot.set_gripper_state(0, 70)
        time.sleep(2)

        # 2. 获取当前坐标，仅作为日志记录
        current_coords = None
        for _ in range(5):
            current_coords = cobot.get_coords()
            if current_coords: break
            time.sleep(0.5)
            
        print(f"下降前空间坐标: {current_coords}")
        
        # 3. 核心科技：使用 send_coord (无s) 强锁其它5轴，仅操作 ID=3 (Z轴)
        target_z = 60.0 # 目标贴桌高度 60mm
        print(f"🚀 锁定所有平面姿态，强制Z轴笔直降落至高度: {target_z} mm")
        cobot.send_coord(3, target_z, 15)
        
        # 给它充足的时间慢慢下降
        time.sleep(6)

        # 4. 抓取
        print("触底，闭合抓夹！")
        cobot.set_gripper_state(1, 70)
        time.sleep(2)

        # 5. 原路拉升 (强制 Z 轴回到安全高度 250mm)
        print("拉升高度，带回战利品...")
        cobot.send_coord(3, 250.0, 20)
        time.sleep(5)

        print("动作完成！请检阅。")

    except Exception as e:
        print(f"发生错误: {e}")
