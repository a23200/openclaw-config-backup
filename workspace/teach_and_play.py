import time
import sys
import termios
import tty
from pymycobot.mycobot import MyCobot

port = "/dev/tty.usbserial-54F70030501"
baudrate = 115200

def getch():
    fd = sys.stdin.fileno()
    old_settings = termios.tcgetattr(fd)
    try:
        tty.setraw(sys.stdin.fileno())
        ch = sys.stdin.read(1)
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
    return ch

if __name__ == "__main__":
    try:
        cobot = MyCobot(port, baudrate)
        print("=== 手把手示教录像机启动 ===")
        
        # 放松机械臂
        print("正在发送放松指令...")
        cobot.release_all_servos()
        time.sleep(1)
        print("✅ 机械臂已解除电机锁定！现在它是软的，您可以随意掰动它了。")
        
        recorded_path = []
        
        print("\n=== 操作台 ===")
        print("请在终端输入:")
        print("按 'r' 键: 记录当前姿势 (录制一个关键帧)")
        print("按 'q' 键: 结束录制，并立即开始自动回放！")
        print("==============")
        
        while True:
            ch = getch()
            if ch.lower() == 'r':
                # 尝试获取角度，有时松软状态下可能需要多试几次
                angles = None
                for _ in range(3):
                    angles = cobot.get_angles()
                    if angles: break
                    time.sleep(0.2)
                
                if angles:
                    recorded_path.append(angles)
                    print(f"\n[记录成功] 动作帧 {len(recorded_path)}: {angles}")
                else:
                    print("\n[记录失败] 未能读取到当前角度，请稍微动一下它然后再试。")
            
            elif ch.lower() == 'q':
                print("\n\n⏹️ 停止录像。准备进入回放模式...")
                break
        
        if not recorded_path:
            print("您没有记录任何动作，程序退出。")
            sys.exit(0)
            
        print(f"\n总共录制了 {len(recorded_path)} 个动作帧。")
        print("⚠️ 警告：机械臂即将恢复供电并开始自动回放！请松开手，并保持安全距离！")
        for i in range(3, 0, -1):
            print(f"倒计时 {i} 秒...")
            time.sleep(1)
            
        print("\n▶️ 开始回放录像！")
        # 重新通电并回放
        for i, angles in enumerate(recorded_path):
            print(f">> 正在执行动作帧 {i+1}/{len(recorded_path)}...")
            cobot.send_angles(angles, 30) # 设定安全速度30
            time.sleep(3) # 给予物理运动的时间
            
        print("\n✅ 回放完美结束！机械臂已锁定在最后一个姿势。")
        
    except Exception as e:
        print(f"发生错误: {e}")
