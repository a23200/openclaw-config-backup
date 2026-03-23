import time
from pymycobot.mycobot import MyCobot

port = "/dev/tty.usbserial-54F70030501"
baudrate = 115200

if __name__ == "__main__":
    try:
        cobot = MyCobot(port, baudrate)
        print("启动单轴姿态绝对设定 (Rx横滚角)...")

        # 1. 获取当前坐标
        current_coords = None
        for _ in range(5):
            current_coords = cobot.get_coords()
            if current_coords: break
            time.sleep(0.5)
            
        current_rx = current_coords[3] if current_coords else "未知"
        print(f"当前 Rx 角度为: {current_rx} 度")
        
        # 2. 目标姿态 (-10度绝对值)
        target_rx = -10.0
        print(f"🚀 强行扭转手腕，命令 Rx 绝对调整至: {target_rx:.1f} 度")
        
        # 3. 发送单轴姿态指令 (ID=4 代表 Rx 轴)
        cobot.send_coord(4, target_rx, 20)
        time.sleep(4)

        # 4. 验证
        final_coords = cobot.get_coords()
        if final_coords:
            final_rx = final_coords[3]
            print(f"姿态调整完成！最终实际 Rx 角度为: {final_rx:.1f} 度")
            
        print("动作完成！请老板检阅。")

    except Exception as e:
        print(f"发生错误: {e}")
