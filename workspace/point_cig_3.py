from pymycobot import MyCobot
import time
import json

mc = MyCobot('/dev/cu.usbserial-54F70030501', 115200)
coords = mc.get_coords()

print(f"当前坐标: {coords}")

# 烟盒在画面右下角
# 如果 base 在上方，烟盒在右下方
# 尝试向 Y 正方向移动 80，X 方向不动
print("尝试向 Y 的正方向大范围移动...")
mc.send_coord(2, coords[1] + 100, 40)
time.sleep(2)
