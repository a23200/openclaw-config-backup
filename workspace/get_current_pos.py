from pymycobot import MyCobot
import time

PORT = '/dev/cu.usbserial-54F70030501'
BAUD = 115200

print("✅ 连接机械臂...")
mc = MyCobot(PORT, BAUD)
time.sleep(1)

print("🔍 正在读取当前坐标...")
coords = mc.get_coords()
time.sleep(0.5)

print("🔍 正在读取当前角度...")
angles = mc.get_angles()
time.sleep(0.5)

if coords:
    print(f"📍 当前世界坐标 (X,Y,Z,Rx,Ry,Rz): {coords}")
else:
    print("❌ 读取坐标失败。")

if angles:
     print(f"📐 当前关节角度 (J1-J6): {angles}")
else:
    print("❌ 读取角度失败。")
