from pymycobot import MyCobot
import time
import json
import os

PORT = '/dev/cu.usbserial-54F70030501'
mc = MyCobot(PORT, 115200)

with open('/Users/mac/.openclaw/workspace/home_pos.json', 'r') as f:
    home_angles = json.load(f)['home_angles']

print('1. 回 Home')
mc.send_angles(home_angles, 50)
time.sleep(2)

# 先把手腕转成“从上往下指”的姿势
angles = home_angles.copy()
angles[5] = home_angles[5] - 90  # J6 -90
print(f'2. 手腕转到 J6={angles[5]}')
mc.send_angles(angles, 40)
time.sleep(2)

coords = mc.get_coords()
if coords == [-1] or not coords:
    time.sleep(0.5)
    coords = mc.get_coords()
print(f'当前坐标: {coords}')

# 更激进：更近 + 更低
# 目标：让烟盒出现在抓夹正下方，并让抓夹更贴近桌面
# 在这个朝向下，尝试：X 往前推 110mm，Y 往右 40mm，Z 再下降 50mm
# 若掉高/奇异，单轴逐步走更稳

target_x = coords[0] + 110
target_y = coords[1] + 40
target_z = coords[2] - 50

print(f'3. 前推更近: X -> {target_x}')
mc.send_coord(1, target_x, 35)
time.sleep(1.5)

print(f'4. 横向微调: Y -> {target_y}')
mc.send_coord(2, target_y, 35)
time.sleep(1.5)

print(f'5. 明显下压: Z -> {target_z}')
mc.send_coord(3, target_z, 25)
time.sleep(2)

# 拍照验证
os.system('ffmpeg -f avfoundation -framerate 30 -video_size 1280x720 -i "0" -vframes 1 /Users/mac/.openclaw/workspace/point_cig_closer.jpg -y -loglevel quiet')
print('完成')
