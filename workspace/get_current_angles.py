
from pymycobot.mycobot import MyCobot
from pymycobot import utils
import time
import glob

def get_angles(mc):
    print("🔎 正在读取当前所有关节的角度...")
    current_angles = mc.get_angles()
    if current_angles:
        print(f"✅ 当前角度: {current_angles}")
    else:
        print("⚠️ 未能读取到角度。")

if __name__ == '__main__':
    try:
        port = utils.detect_port_of_basic()
        if port is None:
            ports = glob.glob('/dev/tty.usbserial*')
            if not ports:
                raise Exception("❌ 未能检测到机械臂串口。")
            port = ports[0]
            print(f"⚠️ 自动检测失败，使用端口: {port}")
        
        mc = MyCobot(port, 115200)
        time.sleep(2)

        if mc.is_controller_connected():
            print("✅ 机械臂连接成功！")
            get_angles(mc)
        else:
            print("❌ 控制器未响应。")
            
    except Exception as e:
        print(f"❌ 发生错误: {e}")
