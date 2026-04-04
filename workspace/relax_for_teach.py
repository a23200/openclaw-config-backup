from pymycobot.mycobot import MyCobot
import time
import sys

PORT = '/dev/tty.usbserial-54F70030501'
BAUD = 115200

try:
    mc = MyCobot(PORT, BAUD)
    time.sleep(2)
    print('正在释放所有舵机...')
    mc.release_all_servos()
    time.sleep(1)
    print('机械臂已变软，可以手动拖动示教。')
except Exception as e:
    print('error=', e)
    sys.exit(1)
