
from pymycobot.mycobot import MyCobot
from pymycobot import utils
import time

def point_at_object(mc):
    # Coordinates from MEMORY.md (taught for cigarette box)
    coords = [167.5, -56.9, 95.8, -177.36, -7.15, 134.98]
    print(f"🎯 指向目标坐标: {coords}")
    
    # Send coordinates to the robot arm
    mc.send_coords(coords, 70, 0)
    time.sleep(4)
    print("✅ 已移动到目标位置。")

if __name__ == '__main__':
    try:
        # Detect the serial port
        port = utils.detect_port_of_basic()
        if port is None:
            # Try a common macOS port pattern if detection fails
            import glob
            ports = glob.glob('/dev/tty.usbserial*')
            if not ports:
                raise Exception("❌ 未能检测到机械臂串口，也未找到/dev/tty.usbserial*。请检查连接。")
            port = ports[0]
            print(f"⚠️ 自动检测失败，使用找到的第一个端口: {port}")
        
        # Initialize MyCobot
        # The baudrate for myCobot 280 M5 is 115200
        mc = MyCobot(port, 115200)
        
        # A short delay to ensure the connection is established
        time.sleep(2)

        if mc.is_controller_connected():
            print("✅ 机械臂连接成功！")
            point_at_object(mc)
        else:
            print("❌ 机械臂已连接但控制器未响应。")
            
    except Exception as e:
        print(f"❌ 发生错误: {e}")
