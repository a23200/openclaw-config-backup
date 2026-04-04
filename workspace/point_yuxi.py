import time
from pymycobot.mycobot import MyCobot

port = "/dev/tty.usbserial-54F70030501"
baudrate = 115200

try:
    print("Connecting to MyCobot...")
    cobot = MyCobot(port, baudrate)
    time.sleep(1)

    angles = None
    for _ in range(3):
        angles = cobot.get_angles()
        if angles and len(angles) == 6:
            break
        time.sleep(0.5)

    if angles and len(angles) == 6:
        print(f"当前关节角度 (J1-J6): {angles}")
        
        # 玉溪在画面左下方。如果摄像头在末端，我们需要：
        # 1. 底座(J1)向画面左侧转动
        # 2. 手腕(J5)向下倾斜(点头)
        
        target_angles = list(angles)
        
        # 经验值盲猜：J1 +12度(左转), J5 -25度(低头)。如果不准后续微调。
        target_angles[0] += 12.0
        target_angles[4] -= 25.0
        
        print(f"执行指向目标 (玉溪烟盒) -> 目标角度: {target_angles}")
        cobot.send_angles(target_angles, 20)
        time.sleep(3)
        print("指向动作完毕！")
    else:
        print("通信异常：无法获取当前关节角度。")

except Exception as e:
    print(f"发生错误: {e}")
