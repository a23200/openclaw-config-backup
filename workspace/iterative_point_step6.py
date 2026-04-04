from pymycobot.mycobot import MyCobot
import time
import sys

PORT = '/dev/tty.usbserial-54F70030501'
BAUD = 115200
DX = 80.0
DY = -20.0
POSE = [-170.0, 0.0, -90.0]

try:
    mc = MyCobot(PORT, BAUD)
    time.sleep(2)
    base = mc.get_coords()
    if not base:
        raise ValueError('获取当前坐标失败')
    target = [base[0] + DX, base[1] + DY, base[2]] + POSE
    print('base=', base)
    print('target=', target)
    mc.send_coords(target, 30, 1)
    time.sleep(7)
    print('final=', mc.get_coords())
except Exception as e:
    print('error=', e)
    sys.exit(1)
