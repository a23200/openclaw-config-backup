from pymycobot.mycobot import MyCobot
import time
import sys

PORT = '/dev/tty.usbserial-54F70030501'
BAUD = 115200
DX = 10.0
DY = 5.0
DZ = 0.0
POSE = [-170.0, 0.0, -90.0]

try:
    mc = MyCobot(PORT, BAUD)
    time.sleep(2)
    base = mc.get_coords()
    if not base:
        raise ValueError('获取当前坐标失败')
    target = [base[0] + DX, base[1] + DY, base[2] + DZ] + POSE
    print('base=', base)
    print('target=', target)
    mc.send_coords(target, 20, 1)
    time.sleep(6)
    print('final=', mc.get_coords())
except Exception as e:
    print('error=', e)
    sys.exit(1)
