import time
from pymycobot.mycobot import MyCobot

port = "/dev/tty.usbserial-54F70030501"
baudrate = 115200

if __name__ == "__main__":
    try:
        cobot = MyCobot(port, baudrate)
        print("启动单轴姿态调整 (Ry 旋转)...")

        # 1. 获取当前绝对空间坐标
        current_coords = None
        for _ in range(5):
            current_coords = cobot.get_coords()
            if current_coords: break
            time.sleep(0.5)
            
        if not current_coords:
            raise Exception("无法获取当前空间坐标")

        current_ry = current_coords[4]
        print(f"当前位置锁定！当前绕 Y 轴旋转角度 (Ry) 为: {current_ry:.1f} 度")
        print(f"当前完整坐标为: {current_coords}")
        
        # 2. 目标姿态
        target_ry = 90.0
        
        print(f"🚀 锁定所有空间位置(X,Y,Z)和其他旋转角，命令 Ry 绝对调整至: {target_ry:.1f} 度")
        
        # 3. 发送单轴控制指令 (ID=5 代表 Ry 轴)
        cobot.send_coord(5, target_ry, 20)
        
        # 给予物理运动时间
        time.sleep(5)

        # 4. 验证最终姿态
        final_coords = cobot.get_coords()
        if final_coords:
            final_ry = final_coords[4]
            print(f"姿态调整完成！最终实际 Ry 角度为: {final_ry:.1f} 度")
            print(f"姿态改变了: {abs(final_ry - current_ry):.1f} 度")

        print("动作完成！请老板检阅。")

    except Exception as e:
        print(f"发生错误: {e}")
