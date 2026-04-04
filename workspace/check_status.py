import time
from pymycobot.mycobot import MyCobot

port = "/dev/tty.usbserial-54F70030501"
baudrate = 115200

try:
    cobot = MyCobot(port, baudrate)
    time.sleep(1)

    angles = None
    coords = None
    for _ in range(5):
        angles = cobot.get_angles()
        coords = cobot.get_coords()
        if angles and coords and len(angles) == 6 and len(coords) == 6:
            break
        time.sleep(0.5)

    print(f"当前真实角度: {angles}")
    print(f"当前真实坐标: {coords}")

except Exception as e:
    print(f"Error: {e}")
