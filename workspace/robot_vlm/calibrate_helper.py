import time
from pathlib import Path
import serial.tools.list_ports
from pymycobot import MyCobot
import cv2

HOME_ANGLES = [-148.79, -7.91, -12.04, -66.26, 17.92, -173.49]
TEMP_DIR = Path(__file__).resolve().parent / 'temp'
TEMP_DIR.mkdir(exist_ok=True)
CALIB_IMG = str(TEMP_DIR / "calibration_shot.jpg")

def auto_connect_mycobot():
    ports = serial.tools.list_ports.comports()
    usb_ports = [p.device for p in ports if 'usbserial' in p.device or 'usbmodem' in p.device]
    if not usb_ports:
        print("❌ 找不到机械臂串口")
        return None
    try:
        mc = MyCobot(usb_ports[0], 115200)
        mc.is_power_on()
        return mc
    except:
        return None

def capture_image():
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("❌ 无法打开摄像头")
        return
    time.sleep(1)
    ret, frame = cap.read()
    if ret:
        cv2.imwrite(CALIB_IMG, frame)
        print(f"✅ 俯视图已保存: {CALIB_IMG}")
    cap.release()

def main():
    mc = auto_connect_mycobot()
    if not mc:
        return
    
    print("==============================")
    print("🤖 机械臂极简手眼标定向导")
    print("==============================")
    print("\n[步骤 1] 机械臂即将回到 Home 姿态并拍摄全景俯视图...")
    input("👉 按回车继续...")
    mc.send_angles(HOME_ANGLES, 50)
    time.sleep(3)
    capture_image()
    print("-> 请打开 temp/calibration_shot.jpg，在桌面上找左下角、右上角各一个参照物，用画图工具看一下它们的像素坐标 (x, y)。")
    
    print("\n[步骤 2] 现在机械臂将放松关节，你可以用手自由拖拽。")
    input("👉 按回车释放关节力矩...")
    if hasattr(mc, 'release_all_servos'):
        mc.release_all_servos()
    else:
        print("当前固件不支持一键放松，请手动发送放松指令或直接断电按压。")
    
    print("\n-> 把【吸盘底端】对准你照片里的【左下角】参照物，然后稳住。")
    input("👉 按回车读取当前物理坐标...")
    coords1 = mc.get_coords()
    print(f"📍 左下角机械臂坐标: {coords1[:2]}")
    
    print("\n-> 把【吸盘底端】对准你照片里的【右上角】参照物，然后稳住。")
    input("👉 按回车读取当前物理坐标...")
    coords2 = mc.get_coords()
    print(f"📍 右上角机械臂坐标: {coords2[:2]}")
    
    print("\n==============================")
    print("🎯 标定结束！请把以下数据填入 config/calibration.example.json")
    print(f"robot_point_1 (左下角): [{coords1[0]}, {coords1[1]}]")
    print(f"robot_point_2 (右上角): [{coords2[0]}, {coords2[1]}]")
    print("（像素坐标记得看照片自己填一下）")
    
    print("\n重新锁死关节保护设备...")
    mc.send_angles(HOME_ANGLES, 50)

if __name__ == '__main__':
    main()