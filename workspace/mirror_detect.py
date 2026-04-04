from pymycobot import MyCobot
import time, json, os

PORT = '/dev/cu.usbserial-54F70030501'
mc = MyCobot(PORT, 115200)

with open('/Users/mac/.openclaw/workspace/home_pos.json', 'r') as f:
    home_angles = json.load(f)['home_angles']

# 回 home
mc.send_angles(home_angles, 50)
time.sleep(2)

# 拍 home 图
os.system('ffmpeg -f avfoundation -framerate 30 -video_size 1280x720 -i "0" -vframes 1 /Users/mac/.openclaw/workspace/mirror_home_check.jpg -y -loglevel quiet')

coords = mc.get_coords()
if coords == [-1] or not coords:
    time.sleep(0.5)
    coords = mc.get_coords()
print('HOME', coords)

# 只动 +Y
mc.send_coord(2, coords[1] + 60, 35)
time.sleep(2)
os.system('ffmpeg -f avfoundation -framerate 30 -video_size 1280x720 -i "0" -vframes 1 /Users/mac/.openclaw/workspace/mirror_plusY.jpg -y -loglevel quiet')

# 回 home
mc.send_angles(home_angles, 50)
time.sleep(2)

# 只动 -Y
mc.send_coord(2, coords[1] - 60, 35)
time.sleep(2)
os.system('ffmpeg -f avfoundation -framerate 30 -video_size 1280x720 -i "0" -vframes 1 /Users/mac/.openclaw/workspace/mirror_minusY.jpg -y -loglevel quiet')

print('done')
