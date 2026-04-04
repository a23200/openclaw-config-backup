from pymycobot.mycobot import MyCobot
import time

# 正确的串口地址
port = "/dev/tty.usbserial-54F70030501"

try:
    print(f"正在连接机械臂，端口: {port}")
    mc = MyCobot(port, 115200)
    time.sleep(1)

    # 1. 安全复位，回到初始姿态
    print("第一步: 执行回老家复位...")
    mc.send_angles([0, 0, 0, 0, 0, 0], 70)
    time.sleep(3.5)
    print("复位完成。")

    # 2. 获取当前坐标，作为移动基准
    print("正在获取当前坐标...")
    coords = mc.get_coords()
    if not coords or len(coords) < 3:
        raise ValueError("获取坐标失败，请检查机械臂连接。")
    print(f"当前坐标: {coords}")
    time.sleep(0.5)

    # 3. Z轴下降15cm (150mm)
    target_z = coords[2] - 150
    print(f"第二步: Z轴下降15cm，目标高度: {target_z}mm...")
    mc.send_coord(3, target_z, 70)
    time.sleep(3)
    print("Z轴移动完成。")

    # 4. 根据“中间偏右”的目标，移动XY轴
    current_xy = mc.get_coords()
    target_x = current_xy[0] + 100 
    target_y = current_xy[1] - 40
    print(f"第三步: 指向目标，移动XY轴至 (X:{target_x}, Y:{target_y})...")
    mc.send_coord(1, target_x, 70)
    time.sleep(2)
    mc.send_coord(2, target_y, 70)
    time.sleep(2)
    print("XY轴移动完成。")
    
    print("指向任务执行完毕！机械臂将保持姿态。")

except Exception as e:
    print(f"执行出错: {e}")
