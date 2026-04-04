from pymycobot.mycobot import MyCobot
import time

# 正确的串口地址
port = "/dev/tty.usbserial-54F70030501"

try:
    print("正在连接机械臂...")
    mc = MyCobot(port, 115200)
    time.sleep(1)

    # 1. 安全复位，回到初始姿态（奇异点）
    print("第一步: 执行回老家复位...")
    mc.send_angles([0, 0, 0, 0, 0, 0], 80)
    time.sleep(4)
    print("复位完成。")

    # 2. **关键步骤**: 弯曲手肘(J3关节)30度，以脱离奇异点
    print("第二步: 弯曲手肘以脱离奇异点...")
    mc.send_angle(3, 30, 70)
    time.sleep(2.5)
    print("已脱离奇异点，现在可以安全地进行坐标移动。")

    # 3. 获取脱离奇异点后的安全坐标
    coords = mc.get_coords()
    if not coords: raise ValueError("获取坐标失败")
    print(f"当前安全坐标: {coords}")
    time.sleep(0.5)

    # 4. Z轴下降15cm (150mm)
    target_z = coords[2] - 150
    print(f"第三步: Z轴下降15cm，目标高度: {target_z}mm...")
    mc.send_coord(3, target_z, 70)
    time.sleep(3)
    print("Z轴移动完成。")

    # 5. 指向目标
    current_xy = mc.get_coords()
    if not current_xy: raise ValueError("再次获取坐标失败")
    target_x = current_xy[0] + 100
    target_y = current_xy[1] - 40
    print(f"第四步: 指向目标，移动XY轴至 (X:{target_x}, Y:{target_y})...")
    mc.send_coord(1, target_x, 70)
    time.sleep(2)
    mc.send_coord(2, target_y, 70)
    time.sleep(2)
    print("XY轴移动完成。")
    
    print("指向任务执行完毕！机械臂将保持姿态。")

except Exception as e:
    print(f"执行出错: {e}")

