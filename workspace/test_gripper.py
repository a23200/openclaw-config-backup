import time
from pymycobot.mycobot import MyCobot

port = "/dev/tty.usbserial-54F70030501"
baudrate = 115200

if __name__ == "__main__":
    try:
        cobot = MyCobot(port, baudrate)
        print("已连接机械臂，开始测试抓夹...")
        
        # 张开抓夹 (0代表张开)
        print("张开抓夹...")
        cobot.set_gripper_state(0, 70)
        time.sleep(3)
        
        # 闭合抓夹 (1代表闭合)
        print("闭合抓夹...")
        cobot.set_gripper_state(1, 70)
        time.sleep(3)
        
        # 再次张开
        print("再次张开...")
        cobot.set_gripper_state(0, 70)
        time.sleep(2)
        
        print("抓夹测试完成！")
    except Exception as e:
        print(f"发生错误: {e}")
