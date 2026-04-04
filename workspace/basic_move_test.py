from pymycobot.mycobot import MyCobot
import time

# 您电脑上正确的串口名称
port = "/dev/tty.usbserial-54F70030501" 

try:
    print(f"正在连接机械臂，端口是: {port}")
    mc = MyCobot(port, 115200)

    print("正在发送指令: J1 -> 0 度...")
    mc.send_angle(1, 0, 50)
    time.sleep(2.5) 

    print("指令发送完毕。")
    # 操作结束后释放所有舵机，让机械臂可以被手动拖动
    mc.release_all_servos()
    print("机械臂已放松。")

except Exception as e:
    print(f"出错了: {e}")
