from pymycobot.mycobot import MyCobot
import time
import subprocess
import sys

PORT = '/dev/tty.usbserial-54F70030501'

try:
    mc = MyCobot(PORT, 115200)
    time.sleep(2)

    base_coords = mc.get_coords()
    print(f"基准坐标: {base_coords}")

    # Move X + 20
    target_x = base_coords.copy()
    target_x[0] += 20
    print(f"X轴 +20mm...")
    mc.send_coords(target_x, 40, 1)
    time.sleep(4)
    subprocess.run(["imagesnap", "-w", "1", "servo_x.jpg"])

    # Back to base
    mc.send_coords(base_coords, 40, 1)
    time.sleep(4)

    # Move Y + 20
    target_y = base_coords.copy()
    target_y[1] += 20
    print(f"Y轴 +20mm...")
    mc.send_coords(target_y, 40, 1)
    time.sleep(4)
    subprocess.run(["imagesnap", "-w", "1", "servo_y.jpg"])
    
    # Back to base
    mc.send_coords(base_coords, 40, 1)
    print("测试完毕，已退回基准坐标。")

except Exception as e:
    print(f"错误: {e}")
