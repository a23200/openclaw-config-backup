
from pymycobot.mycobot import MyCobot
from pymycobot import utils
import time
import glob

# The known 'home' angles for the robotic arm
HOME_ANGLES = [1.14, 0.43, -4.83, -76.02, 7.55, 133.24]

def go_home(mc):
    print(f"🎯 Home 目标角度: {HOME_ANGLES}")
    
    # Using a two-step process for stability:
    # 1. A quick, general move to the home angles.
    print("🚀 第一步：send_angles 整体回 Home...")
    mc.send_angles(HOME_ANGLES, 80)
    time.sleep(3)
    current_angles_step1 = mc.get_angles()
    print(f"📍 整体回归后当前角度: {current_angles_step1}")

    # 2. A slower, per-joint lock-in to ensure precision.
    print("🔒 第二步：逐轴 send_angle 补锁...")
    for i, angle in enumerate(HOME_ANGLES):
        mc.send_angle(i + 1, angle, 50)
        time.sleep(0.5)
    
    time.sleep(1)
    final_angles = mc.get_angles()
    print(f"✅ 最终角度: {final_angles}")
    print("🏁 Home 恢复完成。")

if __name__ == '__main__':
    try:
        # Detect the serial port
        port = utils.detect_port_of_basic()
        if port is None:
            ports = glob.glob('/dev/tty.usbserial*')
            if not ports:
                raise Exception("❌ 未能检测到机械臂串口。")
            port = ports[0]
            print(f"⚠️ 自动检测失败，使用端口: {port}")
        
        # Initialize MyCobot
        mc = MyCobot(port, 115200)
        time.sleep(2)

        if mc.is_controller_connected():
            print("✅ 机械臂连接成功！")
            go_home(mc)
        else:
            print("❌ 控制器未响应。")
            
    except Exception as e:
        print(f"❌ 发生错误: {e}")
