import time
from pymycobot.mycobot import MyCobot

port = "/dev/tty.usbserial-54F70030501"
baudrate = 115200

try:
    print("Connecting to MyCobot...")
    cobot = MyCobot(port, baudrate)
    time.sleep(1)

    coords = None
    for _ in range(5):
        coords = cobot.get_coords()
        if coords and len(coords) == 6:
            break
        time.sleep(0.5)

    if coords:
        current_z = coords[2]
        print(f"当前Z高度: {current_z} mm")
        
        target_z = current_z - 100.0
        
        # 降到极限低位，给一个更底的防线防止直接砸穿
        if target_z < 30.0:
            print(f"⚠️ 安全拦截：目标Z高度 {target_z}mm 太贴地，强行拉平到 35mm。")
            target_z = 35.0

        print(f"执行极限下压指令 -> send_coord(3, {target_z}, speed=20)")
        cobot.send_coord(3, target_z, 20)
        time.sleep(4)
        print("又降100mm完成！目前的姿态堪称“贴脸开大”。")
    else:
        print("获取底层空间坐标失败，请检查通信。")

except Exception as e:
    print(f"发生错误: {e}")
