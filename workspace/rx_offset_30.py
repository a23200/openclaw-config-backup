import time
from pymycobot.mycobot import MyCobot

port = "/dev/tty.usbserial-54F70030501"
baudrate = 115200

if __name__ == "__main__":
    try:
        cobot = MyCobot(port, baudrate)
        print("启动空间姿态转换 (Rx 横滚角偏移)...")

        # 1. 获取当前坐标
        current_coords = None
        for _ in range(5):
            current_coords = cobot.get_coords()
            if current_coords: break
            time.sleep(0.5)
            
        if not current_coords:
            raise Exception("无法获取当前空间坐标")

        current_rx = current_coords[3]
        print(f"当前绝对位置锁定！当前绕 X 轴旋转角度 (Rx) 为: {current_rx:.1f} 度")
        print(f"当前完整坐标为: {current_coords}")
        
        # 2. 计算目标姿态
        # 几何学上，“Y轴向Z轴偏移30度”意味着绕着X轴旋转30度（Roll角）
        target_rx = current_rx + 30.0
        
        print(f"🚀 锁定 XYZ 空间原点，命令 Rx (绕X轴) 偏移 +30 度，目标姿态: {target_rx:.1f} 度")
        
        # 3. 发送单轴姿态指令 (ID=4 代表 Rx 轴)
        cobot.send_coord(4, target_rx, 20)
        
        time.sleep(4)

        # 4. 验证
        final_coords = cobot.get_coords()
        if final_coords:
            final_rx = final_coords[3]
            print(f"姿态调整完成！最终实际 Rx 角度为: {final_rx:.1f} 度")
            print(f"实际偏移量: {final_rx - current_rx:.1f} 度")

        print("动作完成！请老板检阅。")

    except Exception as e:
        print(f"发生错误: {e}")
