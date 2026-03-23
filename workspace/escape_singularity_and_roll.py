import time
from pymycobot.mycobot import MyCobot

port = "/dev/tty.usbserial-54F70030501"
baudrate = 115200

if __name__ == "__main__":
    try:
        cobot = MyCobot(port, baudrate)
        print("启动脱离奇异点并执行极限翻滚任务...")

        # 获取当前高度
        coords = None
        for _ in range(5):
            coords = cobot.get_coords()
            if coords: break
            time.sleep(0.5)
        
        if not coords:
            raise Exception("无法获取坐标")
        
        start_z = coords[2]
        print(f"当前高度: {start_z:.1f} mm. 处于伸展极限 (奇异点) 附近。")

        # 步骤 1：下降 100mm 腾出关节空间
        target_z = start_z - 100.0
        print(f"1. 垂直下降 100mm, 目标 Z 轴: {target_z:.1f} mm (释放关节空间)...")
        cobot.send_coord(3, target_z, 20)
        time.sleep(5)

        # 步骤 2：执行 Rx = -10 度的翻滚
        print(f"2. 空间释放完毕，执行死亡翻滚：命令 Rx 绝对姿态调整至 -10.0 度...")
        cobot.send_coord(4, -10.0, 20)
        time.sleep(5)

        # 验证最终姿态
        final_coords = cobot.get_coords()
        if final_coords:
            print(f"动作完成！最终实际坐标: Z = {final_coords[2]:.1f} mm, Rx = {final_coords[3]:.1f} 度")

    except Exception as e:
        print(f"发生错误: {e}")
