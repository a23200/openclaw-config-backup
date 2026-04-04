from pymycobot import MyCobot
import time

mc = MyCobot('/dev/cu.usbserial-54F70030501', 115200)
coords = mc.get_coords()

print(f"当前坐标: {coords}")

# 往回移一点 Y，然后增加 X，看往哪个方向走
mc.send_coord(1, coords[0] + 80, 40)
time.sleep(2)
mc.send_coord(2, coords[1] - 80, 40)
time.sleep(2)
