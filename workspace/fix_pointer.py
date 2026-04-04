from pymycobot import MyCobot
import time
import json
import os

mc = MyCobot('/dev/cu.usbserial-54F70030501', 115200)
with open('/Users/mac/.openclaw/workspace/home_pos.json', 'r') as f:
    home_angles = json.load(f)['home_angles']

print("1. 恢复 Home...")
mc.send_angles(home_angles, 50)
time.sleep(2)

print("2. 旋转 J6 -90度，看抓夹怎么指...")
angles = home_angles.copy()
angles[5] = angles[5] - 90
mc.send_angles(angles, 40)
time.sleep(2)

os.system('ffmpeg -f avfoundation -framerate 30 -video_size 1280x720 -i "0" -vframes 1 /Users/mac/.openclaw/workspace/fix_j6_minus90.jpg -y -loglevel quiet')

print("3. 旋转 J6 -180度，看抓夹怎么指...")
angles[5] = home_angles[5] - 180
mc.send_angles(angles, 40)
time.sleep(2)

os.system('ffmpeg -f avfoundation -framerate 30 -video_size 1280x720 -i "0" -vframes 1 /Users/mac/.openclaw/workspace/fix_j6_minus180.jpg -y -loglevel quiet')
