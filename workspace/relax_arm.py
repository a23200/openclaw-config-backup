
from pymycobot.mycobot import MyCobot
from pymycobot import utils
import time
import glob

def relax_arm(mc):
    print("🧘 正在放松所有关节...")
    mc.release_all_servos()
    time.sleep(1) # Give it a moment to process
    print("✅ 机械臂已变软，现在可以手动移动。")

if __name__ == '__main__':
    try:
        # Detect the serial port
        port = utils.detect_port_of_basic()
        if port is None:
            ports = glob.glob('/dev/tty.usbserial*')
            if not ports:
                raise Exception("❌ 未能检测到机械臂串口，也未找到/dev/tty.usbserial*。请检查连接。")
            port = ports[0]
            print(f"⚠️ 自动检测失败，使用找到的第一个端口: {port}")
        
        # Initialize MyCobot
        mc = MyCobot(port, 115200)
        time.sleep(2)

        if mc.is_controller_connected():
            print("✅ 机械臂连接成功！")
            relax_arm(mc)
        else:
            print("❌ 机械臂已连接但控制器未响应。")
            
    except Exception as e:
        print(f"❌ 发生错误: {e}")
