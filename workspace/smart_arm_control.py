import time
from pymycobot.mycobot import MyCobot

# 硬件连接配置
port = "/dev/tty.usbserial-54F70030501"
baudrate = 115200

# 定义几个关键位置的关节角度
# [J1, J2, J3, J4, J5, J6]
home_pos = [0, 0, 0, 0, 0, 0]
ready_pos = [0, -10, -80, 0, 50, 0] # 准备姿态
pick_approach_pos = [0, 20, -60, 0, 50, 0] # 抓取前的预备位置
pick_pos = [0, 45, -90, 0, 50, 0]   # 俯身抓取的位置
drop_off_pos = [90, 0, -45, 0, 50, 0] # 移动到旁边准备放下

def move_arm(cobot, position, speed=30, delay=3):
    """移动机械臂到指定位置并等待"""
    print(f"移动到: {position}")
    cobot.send_angles(position, speed)
    time.sleep(delay)

def control_gripper(cobot, state, speed=70, delay=2):
    """控制抓夹状态 (0=张开, 1=闭合)"""
    action = "张开" if state == 0 else "闭合"
    print(f"{action}抓夹...")
    cobot.set_gripper_state(state, speed)
    time.sleep(delay)

if __name__ == "__main__":
    try:
        cobot = MyCobot(port, baudrate)
        print("已连接机械臂，开始执行智能抓取流程...")
        
        # 1. 回到初始位置
        move_arm(cobot, home_pos)
        
        # 2. 移动到准备姿态
        move_arm(cobot, ready_pos)
        
        # 3. 张开抓夹，准备抓取
        control_gripper(cobot, 0)
        
        # 4. 移动到抓取预备位置
        move_arm(cobot, pick_approach_pos)

        # 5. 缓缓俯身到抓取位置
        move_arm(cobot, pick_pos, speed=20)
        
        # 6. 闭合抓夹
        control_gripper(cobot, 1)
        
        # 7. 抬起
        move_arm(cobot, pick_approach_pos, speed=20)
        
        # 8. 移动到目标位置
        move_arm(cobot, drop_off_pos)
        
        # 9. 张开抓夹，放下物体
        control_gripper(cobot, 0)
        
        # 10. 回到初始位置
        move_arm(cobot, home_pos)
        
        print("智能抓取流程测试完成！")
        
    except Exception as e:
        print(f"发生错误: {e}")
