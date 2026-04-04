from pymycobot.mycobot import MyCobot
import time
import sys

PORT = '/dev/tty.usbserial-54F70030501'
BAUD = 115200

# 基于烟盒教学规律迁移过来的“鼠标第一步预备位”
# 思路：保持底座基本不动，主要用 J2/J3/J4 做前送、下探和姿态补偿
ANGLES = [1.5, -20.0, -105.0, 40.0, 4.0, 134.0]

try:
    mc = MyCobot(PORT, BAUD)
    time.sleep(2)
    print('target_angles=', ANGLES)
    mc.send_angles(ANGLES, 18)
    time.sleep(7)
    print('final_angles=', mc.get_angles())
    print('final_coords=', mc.get_coords())
except Exception as e:
    print('error=', e)
    sys.exit(1)
