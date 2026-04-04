from pymycobot.mycobot import MyCobot
import time
import sys

PORT = '/dev/tty.usbserial-54F70030501'

try:
    mc = MyCobot(PORT, 115200)
    time.sleep(2)

    # 读取基准坐标，只在X轴上增加30mm
    base_coords = mc.get_coords()
    if not base_coords: raise ValueError("获取坐标失败")
    
    target_x = base_coords[0] + 30
    print(f"X轴移动 +30mm，从 {base_coords[0]} 至 {target_x}...")
    
    mc.send_coord(1, target_x, 40)
    time.sleep(3)
    
    print(f"✅ X轴移动完成。")

except Exception as e:
    print(f"❌ 错误: {e}")
