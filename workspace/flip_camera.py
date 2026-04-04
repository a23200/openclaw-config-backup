from pymycobot import MyCobot
import time
import json
import os

mc = MyCobot('/dev/cu.usbserial-54F70030501', 115200)
with open('/Users/mac/.openclaw/workspace/home_pos.json', 'r') as f:
    home_angles = json.load(f)['home_angles']

mc.send_angles(home_angles, 50)
time.sleep(2)

# 旋转 J6 180度
angles = home_angles.copy()
angles[5] = angles[5] - 180
mc.send_angles(angles, 40)
time.sleep(2)

os.system('ffmpeg -f avfoundation -framerate 30 -video_size 1280x720 -i "0" -vframes 1 /Users/mac/.openclaw/workspace/flip_j6.jpg -y -loglevel quiet')

# 此时镜头倒转，我们需要移动 X/Y 使得烟盒出现在摄像头的合适位置
# 之前的 home 坐标是 X=90, Y=-55
coords = mc.get_coords()
if coords == [-1]:
    time.sleep(0.5)
    coords = mc.get_coords()

# 随便平移一下，让画面内容丰富一点
mc.send_coord(1, coords[0] + 50, 40)
mc.send_coord(2, coords[1] - 50, 40)
time.sleep(2)

os.system('ffmpeg -f avfoundation -framerate 30 -video_size 1280x720 -i "0" -vframes 1 /Users/mac/.openclaw/workspace/flip_j6_moved.jpg -y -loglevel quiet')
