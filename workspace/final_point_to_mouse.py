from pymycobot.mycobot import MyCobot
import time
import sys

PORT = '/dev/tty.usbserial-54F70030501'
BAUD = 115200

# 基于所有训练数据，最终优化过的鼠标指向姿态
# 1. 形态接近之前的成功逼近
# 2. J1 底座基本不动
# 3. J6 末端做了微调，修正横向
TARGET_ANGLES = [1.8, -19.5, -108.0, 42.0, 5.0, 115.0]

try:
    mc = MyCobot(PORT, BAUD)
    time.sleep(2)
    print('target_angles=', TARGET_ANGLES)
    mc.send_angles(TARGET_ANGLES, 15)
    time.sleep(8)
    print('final_angles=', mc.get_angles())
    print('final_coords=', mc.get_coords())
except Exception as e:
    print('error=', e)
    sys.exit(1)
