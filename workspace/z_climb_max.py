import time
from pymycobot.mycobot import MyCobot

port = "/dev/tty.usbserial-54F70030501"
baudrate = 115200

if __name__ == "__main__":
    try:
        cobot = MyCobot(port, baudrate)
        print("启动强制锁止垂直攀升任务...")

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
        
        # 2. 目标高度 (myCobot Z轴物理极限极高，通常设一个大值如 350+，底层会自动限幅在最高可达点)
        target_z = 350.0 # 根据当前姿态的可能最高点设定一个较大的目标
        
        print(f"🚀 锁定所有平面姿态和旋转，命令 Z 轴绝对笔直攀升至安全高度上限: {target_z:.1f} mm")
        
        # 3. 发送单轴控制指令 (ID=3 代表 Z 轴)
        cobot.send_coord(3, target_z, 20)
        
        # 给予物理运动时间
        time.sleep(5)

        # 4. 验证最终高度
        final_coords = cobot.get_coords()
        if final_coords:
            final_z = final_coords[2]
            print(f"攀升完成！最终实际高度 Z 轴为: {final_z:.1f} mm")
            actual_climb = final_z - current_z
            print(f"实际垂直攀升量: {actual_climb:.1f} mm")

        print("动作完成！请老板检阅。")

    except Exception as e:
        print(f"发生错误: {e}")
