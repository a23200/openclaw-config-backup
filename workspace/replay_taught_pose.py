from pymycobot.mycobot import MyCobot
import time
import sys
import json

PORT = '/dev/tty.usbserial-54F70030501'
BAUD = 115200

try:
    with open('taught_pose.json', 'r') as f:
        data = json.load(f)
    coords = data['coords']
    angles = data['angles']

    mc = MyCobot(PORT, BAUD)
    time.sleep(2)

    print('先尝试用关节角复现...')
    mc.send_angles(angles, 20)
    time.sleep(6)
    print('当前角度=', mc.get_angles())

    print('再尝试用坐标精修...')
    mc.send_coords(coords, 20, 1)
    time.sleep(6)
    print('当前坐标=', mc.get_coords())
    print('复现完成。')
except Exception as e:
    print('error=', e)
    sys.exit(1)
