from pymycobot.mycobot import MyCobot
import time
import sys

PORT = '/dev/tty.usbserial-54F70030501'
BAUD = 115200

# 比上次更轻的上抬：只做极小幅调整
TARGET_ANGLES = [1.5, -19.2, -105.0, 39.2, 4.0, 134.0]

try:
    mc = MyCobot(PORT, BAUD)
    time.sleep(2)
    print('target_angles=', TARGET_ANGLES)
    mc.send_angles(TARGET_ANGLES, 12)
    time.sleep(6)
    print('final_angles=', mc.get_angles())
    print('final_coords=', mc.get_coords())
except Exception as e:
    print('error=', e)
    sys.exit(1)
