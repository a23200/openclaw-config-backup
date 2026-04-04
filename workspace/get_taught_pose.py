from pymycobot.mycobot import MyCobot
import time
import sys
import json

PORT = '/dev/tty.usbserial-54F70030501'
BAUD = 115200

try:
    mc = MyCobot(PORT, BAUD)
    time.sleep(2)
    coords = mc.get_coords()
    angles = mc.get_angles()
    print('coords=', coords)
    print('angles=', angles)
    with open('taught_pose.json', 'w') as f:
        json.dump({'coords': coords, 'angles': angles}, f, indent=2)
    print('姿态已保存到 taught_pose.json')
except Exception as e:
    print('error=', e)
    sys.exit(1)
