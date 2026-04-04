from pymycobot import MyCobot
import time
import json

port = "/dev/cu.usbserial-54F70030501"
baud = 115200
mc = MyCobot(port, baud)

print("✅ 已连接。正在释放电机...")
mc.release_all_servos()
print("🤖 机械臂现在变软了。")
print("👉 请手动将机械臂调整到你想要的 Home 位置。")
input("按下回车键 (Enter) 锁定当前位置并保存为 Home...")

# 稍微等一下让它稳定
time.sleep(1)

# 获取当前角度
angles = mc.get_angles()
if not angles:
    print("❌ 获取角度失败，请重试。")
    exit(1)

print(f"📍 捕获到的角度: {angles}")

# 锁定电机
mc.power_on()
print("🔒 已重新锁定电机。")

# 保存到文件
home_data = {"home_angles": angles}
with open("/Users/mac/.openclaw/workspace/home_pos.json", "w") as f:
    json.dump(home_data, f)

print("💾 Home 位置已保存至 home_pos.json")
