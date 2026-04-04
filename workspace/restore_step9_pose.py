from pymycobot.mycobot import MyCobot
import time
import sys

PORT = '/dev/tty.usbserial-54F70030501'
BAUD = 115200
TARGET = [189.3, -47.5, 161.1, -171.77, -0.21, -90.17]

try:
    mc = MyCobot(PORT, BAUD)
    time.sleep(2)
    print('target=', TARGET)
    mc.send_coords(TARGET, 20, 1)
    time.sleep(7)
    print('final=', mc.get_coords())
except Exception as e:
    print('error=', e)
    sys.exit(1)
