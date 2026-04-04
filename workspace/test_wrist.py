from pymycobot import MyCobot
import time
import json
import os

mc = MyCobot('/dev/cu.usbserial-54F70030501', 115200)

with open('/Users/mac/.openclaw/workspace/home_pos.json', 'r') as f:
    home_angles = json.load(f)['home_angles']

print("1. 回复 Home...")
mc.send_angles(home_angles, 50)
time.sleep(2)

print("2. 弯曲手腕 J5 = 90...")
angles_1 = home_angles.copy()
angles_1[4] = 90
mc.send_angles(angles_1, 40)
time.sleep(2)
os.system('ffmpeg -f avfoundation -framerate 30 -video_size 1280x720 -i "0" -vframes 1 /Users/mac/.openclaw/workspace/wrist_j5_90.jpg -y -loglevel quiet')

print("3. 弯曲手腕 J5 = -90...")
angles_2 = home_angles.copy()
angles_2[4] = -90
mc.send_angles(angles_2, 40)
time.sleep(2)
os.system('ffmpeg -f avfoundation -framerate 30 -video_size 1280x720 -i "0" -vframes 1 /Users/mac/.openclaw/workspace/wrist_j5_minus90.jpg -y -loglevel quiet')

print("4. 恢复手腕，旋转 J6 = 40...")
angles_3 = home_angles.copy()
angles_3[5] = 40
mc.send_angles(angles_3, 40)
time.sleep(2)
os.system('ffmpeg -f avfoundation -framerate 30 -video_size 1280x720 -i "0" -vframes 1 /Users/mac/.openclaw/workspace/wrist_j6_40.jpg -y -loglevel quiet')

print("恢复 Home...")
mc.send_angles(home_angles, 50)
