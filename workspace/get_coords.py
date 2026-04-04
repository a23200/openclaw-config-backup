from pymycobot import MyCobot
import time

mc = MyCobot('/dev/cu.usbserial-54F70030501', 115200)
time.sleep(1)
coords = mc.get_coords()
print(f"Current Coords: {coords}")
