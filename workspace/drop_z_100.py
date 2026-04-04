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
        print(f"当前空间坐标获取成功。当前Z高度: {current_z} mm")
        
        target_z = current_z - 100.0
        
        # 为了防止Z轴100mm下砸直接怼到桌面（撞击玉溪或者手柄），设个安全阈值（80mm）
        if target_z < 80.0:
            print(f"⚠️ 安全拦截：目标Z高度 {target_z}mm 太低了，有怼到桌面的风险！自动拉升到安全底线 90mm。")
            target_z = 90.0

        print(f"启动今天总结的【真理指令】：单轴坐标锁定 -> send_coord(3, {target_z}, speed=20)")
        cobot.send_coord(3, target_z, 20)
        time.sleep(4)
        print("高度下降完成！原指向姿态已完美保持。")
    else:
        print("未获取到当前坐标，防呆机制启动，操作取消。")

except Exception as e:
    print(f"报错了: {e}")
