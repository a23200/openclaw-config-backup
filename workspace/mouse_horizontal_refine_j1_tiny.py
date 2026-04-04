from pymycobot.mycobot import MyCobot
import time
import sys

PORT = '/dev/tty.usbserial-54F70030501'
BAUD = 115200

# 在轻微上抬姿态基础上，只做极小底座横向收口
TARGET_ANGLES = [3.52, -20.39, -105.02, 39.02, 4.3, 133.76]

try:
    mc = MyCobot(PORT, BAUD)
    time.sleep(2)
    print('target_angles=', TARGET_ANGLES)
    mc.send_angles(TARGET_ANGLES, 10)
    time.sleep(6)
    print('final_angles=', mc.get_angles())
    print('final_coords=', mc.get_coords())
except Exception as e:
    print('error=', e)
    sys.exit(1)
