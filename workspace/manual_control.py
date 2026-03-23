# -*- coding: UTF-8 -*-
import time, sys, tty, termios
from pymycobot.mycobot import MyCobot

# --- 全局配置 ---
port = "/dev/tty.usbserial-54F70030501"
baudrate = 115200
speed = 30  # 移动速度
increment = 2.0  # 每次按键移动的角度增量

# --- 状态变量 ---
angles = [0.0] * 6
gripper_state = 0 # 0 for open, 1 for closed

def getch():
    """获取单个字符输入"""
    fd = sys.stdin.fileno()
    old_settings = termios.tcgetattr(fd)
    try:
        tty.setraw(sys.stdin.fileno())
        ch = sys.stdin.read(1)
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
    return ch

def print_status():
    """打印当前状态"""
    sys.stdout.write("\r关节角度: [%s], 抓夹状态: %s" % (
        ", ".join(["{:.1f}".format(a) for a in angles]),
        "张开" if gripper_state == 0 else "闭合"
    ))
    sys.stdout.flush()

def print_instructions():
    print("\n--- 机械臂手动遥控脚本 ---")
    print("说明: 按下按键微调对应关节，脚本会实时显示当前角度。")
    print("关节 1 (底座): q (逆时针) / w (顺时针)")
    print("关节 2: a / s")
    print("关节 3: z / x")
    print("关节 4: e / r")
    print("关节 5: d / f")
    print("关节 6: c / v")
    print("抓夹控制: g (张开) / h (闭合)")
    print("-----------------------------")
    print("按 'k' 键退出程序。")
    print("请将机械臂调整到完美的抓取位置，然后将显示的'关节角度'复制给我。")
    print("-----------------------------\n")

if __name__ == "__main__":
    try:
        cobot = MyCobot(port, baudrate)
        # 获取初始角度
        initial_angles = cobot.get_angles()
        if initial_angles:
            angles = initial_angles
        else:
            cobot.send_angles(angles, speed) # 如果获取失败，先归零
        
        print_instructions()
        print_status()

        while True:
            key = getch()

            if key == 'k':
                print("\n程序退出。")
                break

            # 关节控制
            key_map = {
                'q': (0, -increment), 'w': (0, increment),
                'a': (1, -increment), 's': (1, increment),
                'z': (2, -increment), 'x': (2, increment),
                'e': (3, -increment), 'r': (3, increment),
                'd': (4, -increment), 'f': (4, increment),
                'c': (5, -increment), 'v': (5, increment),
            }

            if key in key_map:
                joint, change = key_map[key]
                angles[joint] += change
                cobot.send_angle(joint + 1, angles[joint], speed)
            
            # 抓夹控制
            elif key == 'g':
                gripper_state = 0
                cobot.set_gripper_state(0, 70)
            elif key == 'h':
                gripper_state = 1
                cobot.set_gripper_state(1, 70)

            print_status()

    except Exception as e:
        print(f"\n发生错误: {e}")
    finally:
        # 恢复终端设置
        fd = sys.stdin.fileno()
        old_settings = termios.tcgetattr(fd)
        termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
