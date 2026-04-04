from pymycobot.mycobot import MyCobot
import time
import sys

PORT = '/dev/tty.usbserial-54F70030501'
BAUD = 115200

# 小幅上抬：优先通过 J2/J4 微调，让摄像头视野里的目标往上走
# 当前近似姿态参考： [1.58, -20.47, -105.02, 39.55, 4.3, 133.68]
TARGET_ANGLES = [1.58, -18.5, -105.0, 37.5, 4.3, 133.68]

try:
    mc = MyCobot(PORT, BAUD)
    time.sleep(2)
    print('target_angles=', TARGET_ANGLES)
    mc.send_angles(TARGET_ANGLES, 15)
    time.sleep(6)
    print('final_angles=', mc.get_angles())
    print('final_coords=', mc.get_coords())
except Exception as e:
    print('error=', e)
    sys.exit(1)
