import time
from pymycobot.mycobot import MyCobot

port = "/dev/tty.usbserial-54F70030501"
baudrate = 115200

def control_gripper(cobot, state, speed=70, delay=2):
    cobot.set_gripper_state(state, speed)
    time.sleep(delay)

if __name__ == "__main__":
    try:
        cobot = MyCobot(port, baudrate)
        print("启动纯净垂直抓取 (原地直降模式)...")

        # 1. 确保抓夹张开
        print("张开抓夹...")
        control_gripper(cobot, 0)

        # 2. 获取当前的实时坐标 (就在正上方)
        current_coords = None
        for _ in range(5):
            current_coords = cobot.get_coords()
            if current_coords: break
            time.sleep(0.5)
            
        print(f"当前对准坐标: {current_coords}")
        
        # 3. 计算下降目标点 (只改Z轴，降至60mm贴脸高度)
        target_pick_coords = list(current_coords)
        target_pick_coords[2] = 60.0 
        
        print(f"🚀 锁定正下方，开始垂直深潜至高度 Z: {target_pick_coords[2]} 毫米")
        try:
            cobot.send_coords(target_pick_coords, 15, 1) # 直线下降
        except TypeError:
            cobot.send_coords(target_pick_coords, 15)
        time.sleep(5)

        # 4. 抓取
        print("闭合抓夹！")
        control_gripper(cobot, 1)

        # 5. 原路拉升
        print("拉升高度，带回战利品...")
        try:
            cobot.send_coords(current_coords, 20, 1)
        except TypeError:
            cobot.send_coords(current_coords, 20)
        time.sleep(4)

        print("动作完成！")

    except Exception as e:
        print(f"发生错误: {e}")
