from pymycobot import MyCobot
import time
import json

mc = MyCobot('/dev/cu.usbserial-54F70030501', 115200)

print("正在回老家...")
try:
    with open('/Users/mac/.openclaw/workspace/home_pos.json', 'r') as f:
        home_angles = json.load(f)['home_angles']
    mc.send_angles(home_angles, 50)
    time.sleep(2)
except Exception as e:
    print(f"回老家失败: {e}")

coords = mc.get_coords()
if not coords or coords == [-1]:
    time.sleep(0.5)
    coords = mc.get_coords()

print(f"当前坐标: {coords}")

if coords and coords != [-1]:
    # 烟盒在左下角，假设X向后退(-20)，Y向左偏(+20)
    # 此处仅作一个演示性的平移
    target_x = coords[0] - 30
    target_y = coords[1] + 20
    target_z = coords[2] - 10

    print("开始移动...")
    mc.send_coord(1, target_x, 30) # X轴
    time.sleep(1)
    mc.send_coord(2, target_y, 30) # Y轴
    time.sleep(1)
    
    print("下降 10mm...")
    mc.send_coord(3, target_z, 30) # Z轴
    time.sleep(1)
    print("完成指向！")
else:
    print("获取坐标失败，无法继续。")
