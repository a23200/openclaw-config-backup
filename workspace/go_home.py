import time
from pymycobot.mycobot import MyCobot

port = "/dev/tty.usbserial-54F70030501"
baudrate = 115200
home_pos = [0, 0, 0, 0, 0, 0]
speed = 30

if __name__ == "__main__":
    try:
        cobot = MyCobot(port, baudrate)
        print("正在回到初始位置 (Home)...")
        cobot.send_angles(home_pos, speed)
        time.sleep(3)
        print("已回到初始位置。")
    except Exception as e:
        print(f"发生错误: {e}")
