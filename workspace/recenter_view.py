from pymycobot import MyCobot
import time, json, os

PORT = '/dev/cu.usbserial-54F70030501'
mc = MyCobot(PORT, 115200)

with open('/Users/mac/.openclaw/workspace/home_pos.json', 'r') as f:
    home_angles = json.load(f)['home_angles']

print('1. 回 Home')
mc.send_angles(home_angles, 50)
time.sleep(2)

coords = mc.get_coords()
if coords == [-1] or not coords:
    time.sleep(0.5)
    coords = mc.get_coords()
print('HOME coords:', coords)

# 拉远 + 抬高：
# 退后一点（X - 50），升高一点（Z + 60）
target_x = coords[0] - 50
target_z = coords[2] + 60

print('2. 拉远视角 X ->', target_x)
mc.send_coord(1, target_x, 35)
time.sleep(1.8)

print('3. 抬高视角 Z ->', target_z)
mc.send_coord(3, target_z, 30)
time.sleep(2)

os.system('ffmpeg -f avfoundation -framerate 30 -video_size 1280x720 -i "0" -vframes 1 /Users/mac/.openclaw/workspace/recenter_view.jpg -y -loglevel quiet')
print('done')
