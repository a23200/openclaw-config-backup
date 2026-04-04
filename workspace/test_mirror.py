from pymycobot import MyCobot
import time
import json
import os

mc = MyCobot('/dev/cu.usbserial-54F70030501', 115200)
with open('/Users/mac/.openclaw/workspace/home_pos.json', 'r') as f:
    home_angles = json.load(f)['home_angles']

print("1. 恢复基准位置...")
mc.send_angles(home_angles, 50)
time.sleep(2)
os.system('ffmpeg -f avfoundation -framerate 30 -video_size 1280x720 -i "0" -vframes 1 /Users/mac/.openclaw/workspace/mirror_center.jpg -y -loglevel quiet')

coords = mc.get_coords()
if coords == [-1] or not coords:
    time.sleep(0.5)
    coords = mc.get_coords()

print("2. 向机器人自己的 '右侧' (Y减小，往 -Y 方向) 移动 80mm...")
# 在机械臂坐标系中：前是+X，后是-X，左是+Y，右是-Y
mc.send_coord(2, coords[1] - 80, 40)
time.sleep(2)
os.system('ffmpeg -f avfoundation -framerate 30 -video_size 1280x720 -i "0" -vframes 1 /Users/mac/.openclaw/workspace/mirror_right.jpg -y -loglevel quiet')

print("3. 测试完毕")
