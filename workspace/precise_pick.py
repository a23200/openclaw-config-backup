import time
from pymycobot.mycobot import MyCobot

port = "/dev/tty.usbserial-54F70030501"
baudrate = 115200

# 我们算出的黄金比例
PIXELS_PER_MM = 1.5

def control_gripper(cobot, state, speed=70, delay=2):
    action = "张开" if state == 0 else "闭合"
    print(f"{action}抓夹...")
    cobot.set_gripper_state(state, speed)
    time.sleep(delay)

if __name__ == "__main__":
    try:
        cobot = MyCobot(port, baudrate)
        print("启动基于坐标换算的精准抓取 (send_coords 模式)...")

        # 1. 走到悬停标定点 (确保抓夹张开)
        hover_angles = [98.3, 20.0, -20.0, -145.0, -48.5, 0.3]
        control_gripper(cobot, 0)
        cobot.send_angles(hover_angles, 30)
        time.sleep(4)

        # 获取当前的真实空间坐标
        current_coords = None
        for _ in range(5):
            current_coords = cobot.get_coords()
            if current_coords: break
            time.sleep(0.5)
        
        if not current_coords:
            raise Exception("无法获取空间坐标")

        print(f"当前悬停坐标: {current_coords}")
        
        # 2. 模拟视觉识别：假设我们拍了一张照，发现烟盒偏离中心 X:+45像素, Y:-30像素
        print("视觉系统介入：检测到目标偏离画面中心...")
        pixel_offset_x = 45  
        pixel_offset_y = -30 
        print(f"像素偏差 -> X: {pixel_offset_x} px, Y: {pixel_offset_y} px")

        # 3. 核心科技：将像素转换为物理毫米！
        mm_offset_x = pixel_offset_x / PIXELS_PER_MM
        mm_offset_y = pixel_offset_y / PIXELS_PER_MM
        print(f"物理换算 -> 需要 X轴平移 {mm_offset_x:.1f} mm, Y轴平移 {mm_offset_y:.1f} mm")

        # 4. 计算目标上方悬停点的真实坐标
        target_hover_coords = list(current_coords)
        target_hover_coords[0] += mm_offset_x  # X轴调整
        target_hover_coords[1] += mm_offset_y  # Y轴调整
        print(f"计算出完美对准坐标: {target_hover_coords}")

        # 发送高级的直线平移指令 (模式1代表走直线)
        try:
            cobot.send_coords(target_hover_coords, 20, 1)
        except TypeError:
            cobot.send_coords(target_hover_coords, 20)
        time.sleep(3)

        # 5. 垂直降落抓取 (只改变 Z 轴，下降 80mm)
        target_pick_coords = list(target_hover_coords)
        target_pick_coords[2] -= 80.0  # Z轴向下走80毫米
        print(f"垂直笔直下降，目标高度Z: {target_pick_coords[2]:.1f}")
        try:
            cobot.send_coords(target_pick_coords, 15, 1)
        except TypeError:
            cobot.send_coords(target_pick_coords, 15)
        time.sleep(4)

        # 6. 抓取！
        control_gripper(cobot, 1)

        # 7. 笔直抬起 (回到对准时的悬停高度)
        print("笔直抬起...")
        try:
            cobot.send_coords(target_hover_coords, 20, 1)
        except TypeError:
            cobot.send_coords(target_hover_coords, 20)
        time.sleep(3)

        # 8. 回家
        print("任务完成，满载而归。")
        cobot.send_angles([0, 0, 0, 0, 0, 0], 30)

    except Exception as e:
        print(f"发生错误: {e}")
