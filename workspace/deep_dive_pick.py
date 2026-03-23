import time
from pymycobot.mycobot import MyCobot

port = "/dev/tty.usbserial-54F70030501"
baudrate = 115200
PIXELS_PER_MM = 1.5

def control_gripper(cobot, state, speed=70, delay=2):
    action = "张开" if state == 0 else "闭合"
    print(f"{action}抓夹...")
    cobot.set_gripper_state(state, speed)
    time.sleep(delay)

if __name__ == "__main__":
    try:
        cobot = MyCobot(port, baudrate)
        print("启动精准抓取 (Z轴深度空降测试版)...")

        # 1. 走到悬停标定点
        hover_angles = [98.3, 20.0, -20.0, -145.0, -48.5, 0.3]
        control_gripper(cobot, 0)
        cobot.send_angles(hover_angles, 30)
        time.sleep(4)

        current_coords = None
        for _ in range(5):
            current_coords = cobot.get_coords()
            if current_coords: break
            time.sleep(0.5)
            
        print(f"当前高空悬停坐标: {current_coords}")
        
        # 2. 物理平移 (沿用计算好的30mm和-20mm)
        mm_offset_x = 30.0 
        mm_offset_y = -20.0
        
        target_hover_coords = list(current_coords)
        target_hover_coords[0] += mm_offset_x
        target_hover_coords[1] += mm_offset_y
        
        print("XY轴平移对准目标上方...")
        try:
            cobot.send_coords(target_hover_coords, 20, 1)
        except TypeError:
            cobot.send_coords(target_hover_coords, 20)
        time.sleep(3)

        # 3. 阶梯式垂直降落 (核心修改)
        target_pick_coords = list(target_hover_coords)
        print("🚀 开始阶梯式垂直下降潜入...")
        
        # 分别下降 8cm, 14cm, 20cm
        for drop_dist in [80.0, 140.0, 200.0]: 
            target_pick_coords[2] = target_hover_coords[2] - drop_dist
            print(f">>> 深度下潜至高度 Z: {target_pick_coords[2]:.1f} 毫米")
            try:
                cobot.send_coords(target_pick_coords, 15, 1)
            except TypeError:
                cobot.send_coords(target_pick_coords, 15)
            time.sleep(3)

        # 4. 抓取
        control_gripper(cobot, 1)

        # 5. 笔直抬起脱离
        print("拉升高度，脱离抓取区...")
        try:
            cobot.send_coords(target_hover_coords, 20, 1)
        except TypeError:
            cobot.send_coords(target_hover_coords, 20)
        time.sleep(3)

        # 6. 回收
        print("动作完成，回原点。")
        cobot.send_angles([0, 0, 0, 0, 0, 0], 30)

    except Exception as e:
        print(f"发生错误: {e}")
