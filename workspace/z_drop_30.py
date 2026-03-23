import time
from pymycobot.mycobot import MyCobot

port = "/dev/tty.usbserial-54F70030501"
baudrate = 115200

if __name__ == "__main__":
    try:
        cobot = MyCobot(port, baudrate)
        print("启动强制锁止垂直下降任务...")

        # 1. 获取当前绝对空间坐标
        current_coords = None
        for _ in range(5):
            current_coords = cobot.get_coords()
            if current_coords: break
            time.sleep(0.5)
            
        if not current_coords:
            raise Exception("无法获取当前空间坐标")

        current_z = current_coords[2]
        print(f"当前位置锁定！起始高度 Z 轴为: {current_z:.1f} mm")
        print(f"当前完整坐标为: {current_coords}")
        
        # 2. 计算目标高度 (当前高度 - 30mm)
        target_z = current_z - 30.0
        
        print(f"🚀 锁定所有平面姿态，命令 Z 轴绝对笔直下降 30 毫米至目标高度: {target_z:.1f} mm")
        
        # 3. 发送单轴控制指令 (ID=3 代表 Z 轴)
        cobot.send_coord(3, target_z, 20)
        
        # 给予物理运动时间
        time.sleep(4)

        # 4. 验证最终高度
        final_coords = cobot.get_coords()
        if final_coords:
            final_z = final_coords[2]
            print(f"下降完成！最终实际高度 Z 轴为: {final_z:.1f} mm")
            actual_drop = current_z - final_z
            print(f"实际垂直下降量: {actual_drop:.1f} mm (误差: {abs(actual_drop - 30.0):.1f} mm)")

        print("动作完成！请老板检阅。")

    except Exception as e:
        print(f"发生错误: {e}")
