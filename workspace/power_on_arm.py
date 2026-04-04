import time
from pymycobot.mycobot import MyCobot

port = "/dev/tty.usbserial-54F70030501"
baudrate = 115200

try:
    print(f"Connecting to MyCobot on {port}...")
    cobot = MyCobot(port, baudrate)
    time.sleep(1) # wait for initialization
    print("Powering on all servos...")
    cobot.power_on()
    time.sleep(0.5)
    cobot.resume() # Optional, just in case
    print("Arm is now STIFF and ready for action! Power restored.")
except Exception as e:
    print(f"Error: {e}")
