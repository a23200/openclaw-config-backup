from pymycobot.mycobot import MyCobot
import time
import sys

PORT = '/dev/tty.usbserial-54F70030501'
BAUD = 115200

# 固定观察姿态：优先保证“稳定看桌面”，不追求直接指向
OBSERVE = [70.0, -35.0, 285.0, -170.0, 0.0, -90.0]

try:
    mc = MyCobot(PORT, BAUD)
    time.sleep(2)
    print('observe_target=', OBSERVE)
    mc.send_coords(OBSERVE, 20, 1)
    time.sleep(8)
    print('final=', mc.get_coords())
except Exception as e:
    print('error=', e)
    sys.exit(1)
