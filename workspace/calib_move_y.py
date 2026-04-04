from pymycobot.mycobot import MyCobot
import time
import sys

PORT = '/dev/tty.usbserial-54F70030501'

try:
    mc = MyCobot(PORT, 115200)
    time.sleep(2)

    base_coords = mc.get_coords()
    if not base_coords: raise ValueError("获取坐标失败")
    
    target_y = base_coords[1] + 30
    print(f"Y轴移动 +30mm，从 {base_coords[1]} 至 {target_y}...")
    
    mc.send_coord(2, target_y, 40)
    time.sleep(3)
    
    print(f"✅ Y轴移动完成。")

except Exception as e:
    print(f"❌ 错误: {e}")
