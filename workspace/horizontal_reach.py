import time
from pymycobot.mycobot import MyCobot

port = "/dev/tty.usbserial-54F70030501"
baudrate = 115200

if __name__ == "__main__":
    try:
        cobot = MyCobot(port, baudrate)
        print("启动空间锁定平移测试...")

        # --- 第一步：先“蹲”下来，进入工作高度 ---
        print("\n[阶段一]：解除笔直姿态，进入弯曲工作高度...")
        # 发送一组会让机械臂明显弯曲的关节角度，从而降低Z轴高度
        squat_angles = [0, 30, -60, 0, 50, 0] 
        cobot.send_angles(squat_angles, 30)
        time.sleep(4)

        # 读取并锁定当前高度
        current_coords = None
        for _ in range(5):
            current_coords = cobot.get_coords()
            if current_coords: break
            time.sleep(0.5)
            
        if not current_coords:
            raise Exception("无法获取当前空间坐标")

        locked_z_height = current_coords[2]
        print(f"✅ 成功锁定当前 Z 轴绝对高度：{locked_z_height:.1f} mm")
        print(f"当前完整空间坐标为：{current_coords}")

        # --- 第二步：死锁高度，向前平移 (伸展手臂) ---
        print("\n[阶段二]：死锁高度不变，命令 X 轴向前平移 80 毫米...")
        print("👉 请注意观察：机械臂的大臂、小臂和手腕将如何自动协同扭动，以抵消前伸带来的高度下降！")
        
        target_coords = list(current_coords)
        target_coords[0] += 80.0 # 仅 X 轴增加 80mm (向前伸)

        print(f"目标平移坐标：{target_coords}")
        
        # 使用高级空间坐标指令，mode=1 尝试走直线插补
        try:
            cobot.send_coords(target_coords, 20, 1)
        except TypeError:
            cobot.send_coords(target_coords, 20)
            
        # 给足时间让它慢慢展现代偿动作
        time.sleep(6)
        
        # 验证最终高度
        final_coords = cobot.get_coords()
        if final_coords:
            print(f"\n平移完成！最终实际坐标：{final_coords}")
            height_diff = final_coords[2] - locked_z_height
            print(f"Z 轴高度实际变化量：{height_diff:.1f} mm")
        
        print("\n测试圆满结束！请老板检阅代偿效果。")

    except Exception as e:
        print(f"发生错误: {e}")
