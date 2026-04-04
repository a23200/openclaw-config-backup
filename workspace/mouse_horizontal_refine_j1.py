from pymycobot.mycobot import MyCobot
import time
import sys

PORT = '/dev/tty.usbserial-54F70030501'
BAUD = 115200

# 在当前鼠标姿态基础上，优先只做底座横向收口
TARGET_ANGLES = [5.5, -20.39, -105.02, 38.75, 4.3, 133.76]

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
