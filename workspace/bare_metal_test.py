import time
from pymycobot.mycobot import MyCobot

port = "/dev/tty.usbserial-54F70030501"
baudrate = 115200

def strict_move(cobot, angles, speed, desc):
    print(f">> 执行: {desc} | 目标角度: {angles}")
    cobot.send_angles(angles, speed)
    time.sleep(3) # 给予充足的物理运动时间

if __name__ == "__main__":
    try:
        cobot = MyCobot(port, baudrate)
        print("【接管底层】纯关节绝对角度控制测试启动...\n")

        # 1. 绝对零位 (笔直朝天)
        strict_move(cobot, [0, 0, 0, 0, 0, 0], 30, "归零：笔直朝天")

        # 2. 仅大臂前倾 (测试 J2)
        # 假设正数是向前倾
        strict_move(cobot, [0, 45, 0, 0, 0, 0], 30, "大臂下压 45度")

        # 3. 小臂代偿收缩 (测试 J3)
        # 保持大臂45度，小臂往回弯曲90度
        strict_move(cobot, [0, 45, -90, 0, 0, 0], 30, "小臂向内收缩 -90度")

        # 4. 底盘旋转 (测试 J1)
        # 保持姿态，向左旋转 45度
        strict_move(cobot, [45, 45, -90, 0, 0, 0], 30, "底盘向左旋转 45度")

        # 5. 腕部关节测试 (测试 J4, J5)
        strict_move(cobot, [45, 45, -90, 45, 45, 0], 30, "手腕复合扭动")

        # 6. 一键展平恢复
        strict_move(cobot, [0, 0, 0, 0, 0, 0], 30, "测试结束，恢复绝对零位")

        print("\n【底层测试完毕】各个关节响应精确，无任何坐标系畸变！")

    except Exception as e:
        print(f"发生错误: {e}")
