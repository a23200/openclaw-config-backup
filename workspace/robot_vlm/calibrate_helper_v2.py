import json
import time
from pathlib import Path
from camera import capture_image
try:
    from pymycobot import MyCobot
    import serial.tools.list_ports
except ImportError:
    pass

CONFIG_PATH = Path(__file__).resolve().parent / 'config' / 'calibration_3pt.json'
TEMP_DIR = Path(__file__).resolve().parent / 'temp'

def main():
    ports = serial.tools.list_ports.comports()
    usb_ports = [p.device for p in ports if 'usbserial' in p.device or 'usbmodem' in p.device]
    if not usb_ports:
        print("未检测到机械臂！")
        return
    
    mc = MyCobot(usb_ports[0], 115200)
    time.sleep(1)
    
    print("\n[步骤 1] 机械臂回到 Home 姿态并拍摄俯视图...")
    input("👉 按回车继续...")
    
    # 从统一配置文件读取你的真实 Home 角度
    HOME_ANGLES = [-148.79, -7.91, -12.04, -66.26, 17.92, -173.49]
    try:
        home_pos_file = Path("/Users/mac/.openclaw/workspace/home_pos.json")
        if home_pos_file.exists():
            with open(home_pos_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if "home_angles" in data:
                    HOME_ANGLES = data["home_angles"]
    except Exception as e:
        pass
    
    mc.send_angles(HOME_ANGLES, 50)
    time.sleep(3)
    
    img_path = str(TEMP_DIR / "calib_3pt.jpg")
    capture_image(img_path)
    print(f"✅ 俯视图已保存: {img_path}")
    print("-> 请打开这张图，找桌面上【呈三角形】的 3 个参照物（不要选同一条直线上的点）。\n")
    
    print("[步骤 2] 机械臂放松，开始示教。")
    input("👉 按回车释放关节...")
    mc.release_all_servos()
    
    points_rb = []
    names = ["点A (比如左下角)", "点B (比如右上角)", "点C (比如左上角)"]
    for name in names:
        print(f"\n-> 把吸盘对准【{name}】")
        input("👉 对准后按回车读取坐标...")
        coords = mc.get_coords()
        if not coords:
            time.sleep(0.5)
            coords = mc.get_coords()
        xy = [round(coords[0], 1), round(coords[1], 1)]
        print(f"📍 {name} 物理坐标: {xy}")
        points_rb.append(xy)
        
    print("\n重新锁死机械臂...")
    mc.power_on()
    mc.send_angles(HOME_ANGLES, 50)
    
    print("\n==============================")
    print("🎯 标定结束！请把数据填入 config/calibration_3pt.json")

    # 初始化一个模板文件
    template = {
        "image_pt1": [0, 0],
        "robot_pt1": points_rb[0],
        "image_pt2": [0, 0],
        "robot_pt2": points_rb[1],
        "image_pt3": [0, 0],
        "robot_pt3": points_rb[2]
    }
    CONFIG_PATH.parent.mkdir(exist_ok=True)
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        json.dump(template, f, indent=2)

if __name__ == "__main__":
    main()
