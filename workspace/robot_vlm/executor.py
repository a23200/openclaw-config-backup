import cv2
import time
from pathlib import Path
from safety import check_boundaries
from vision_grounding import find_target_coordinates
import json
import numpy as np

try:
    from pymycobot import MyCobot
    import serial.tools.list_ports
    HAS_PYMYCOBOT = True
except ImportError:
    HAS_PYMYCOBOT = False
    print("⚠️  警告：未安装 pymycobot 或 pyserial 库。将使用纯终端模拟打印模式。")
    print("请执行: pip install pymycobot pyserial opencv-python")

# ============== 基础映射 =================

CONFIG_PATH = Path(__file__).resolve().parent / 'config' / 'calibration_3pt.json'
TEMP_DIR = Path(__file__).resolve().parent / 'temp'
TEMP_DIR.mkdir(exist_ok=True)
IMG_PATH = str(TEMP_DIR / "vl_now.jpg")

def load_calibration():
    with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

def eye2hand(x_im: float, y_im: float):
    """手眼标定：使用 OpenCV 的三点仿射变换矩阵（解决摄像头旋转、倾斜问题）"""
    try:
        cfg = load_calibration()
        pts_im = np.float32([cfg['image_pt1'], cfg['image_pt2'], cfg['image_pt3']])
        pts_rb = np.float32([cfg['robot_pt1'], cfg['robot_pt2'], cfg['robot_pt3']])
        
        # 计算 2D 仿射变换矩阵 (2x3)
        M = cv2.getAffineTransform(pts_im, pts_rb)
        
        # 映射输入坐标
        pt = np.float32([[[x_im, y_im]]])
        res = cv2.transform(pt, M)
        x_robot, y_robot = res[0][0]
        
        return round(float(x_robot), 2), round(float(y_robot), 2)
    except FileNotFoundError:
        print("❌ 找不到 calibration_3pt.json！请运行 python3 calibrate_helper_v2.py")
        return 0.0, 0.0
    except KeyError:
        print("❌ json 格式不对，确保有 image_pt1, robot_pt1 等 6 个坐标配置。")
        return 0.0, 0.0


# ============== 真实硬件初始化 =================

class DummyMyCobot:
    """ 当没连机械臂或者报错时，兜底用的虚拟对象 """
    def send_angles(self, angles, speed):
        print(f"[虚拟机械臂] 关节移动到: {angles} (speed={speed})")
        time.sleep(1)
    def send_coords(self, coords, speed, mode):
        print(f"[虚拟机械臂] 末端移动到坐标: {coords} (speed={speed})")
        time.sleep(1)
    def set_basic_output(self, pin, val):
        print(f"[虚拟机械臂] M5 针脚 {pin} 设为 {val} (吸泵)")

def auto_connect_mycobot():
    if not HAS_PYMYCOBOT:
        return DummyMyCobot()
    
    # 自动探测 macOS 的 USB 串口 (通常是 /dev/cu.usbserial-xxx)
    ports = serial.tools.list_ports.comports()
    usb_ports = [p.device for p in ports if 'usbserial' in p.device or 'usbmodem' in p.device]
    
    if not usb_ports:
        print("❌ 未检测到机械臂串口连入 (找不到 usbserial)。切换为虚拟模式。")
        return DummyMyCobot()
    
    port = usb_ports[0]
    print(f"✅ 检测到串口 {port}，正在连接大象机器人 MyCobot 280...")
    try:
        mc = MyCobot(port, 115200)
        # 简单测试通信
        mc.is_power_on()
        print("🔌 连接成功，硬件就绪！")
        return mc
    except Exception as e:
        print(f"❌ 串口被占用或连接失败: {e}。切换为虚拟模式。")
        return DummyMyCobot()

# 实例化全局单例控制器
mc = auto_connect_mycobot()


# ============== 动作集合 =================

def get_home_angles():
    """从统一的配置文件中读取最新记录的 Home 姿态角度"""
    try:
        home_pos_file = Path("/Users/mac/.openclaw/workspace/home_pos.json")
        if home_pos_file.exists():
            with open(home_pos_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if "home_angles" in data:
                    return data["home_angles"]
    except Exception as e:
        print(f"⚠️ 读取 home_pos.json 失败: {e}")
    # Fallback to the last known good home angles
    return [-148.79, -7.91, -12.04, -66.26, 17.92, -173.49]

def back_zero():
    print(">> 执行: 机械臂回原点 (Home 姿态)")
    HOME_ANGLES = get_home_angles()
    mc.send_angles(HOME_ANGLES, 50)
    time.sleep(3)

def relax_arms():
    print(">> 执行: 释放所有舵机力矩 (拖动示教)")
    if hasattr(mc, 'release_all_servos'):
        mc.release_all_servos()

def pump_on():
    print(">> 执行: 开启吸泵")
    mc.set_basic_output(2, 0)
    mc.set_basic_output(5, 0)
    time.sleep(1)

def pump_off():
    print(">> 执行: 关闭吸泵")
    mc.set_basic_output(2, 1)
    mc.set_basic_output(5, 1)

def move_to_coords(x, y):
    print(f">> 执行: 平移到二维坐标 X={x}, Y={y}")
    # 安全墙检查
    check_boundaries(x, y)
    
    # Z=150 是安全飞行高度，RX,RY,RZ是姿态（纯俯视通常是 -180, 0, 0 左右，需要视你装的末端工具定）
    # mode=1 表示线性规划移动
    mc.send_coords([x, y, 150, -180, 0, 0], 50, 1)
    time.sleep(2)

def vlm_move(prompt_text: str):
    """
    眼在手上 (Eye-in-hand) 抓取/指向核心串联逻辑：
    0. 必须先回 Home（保证每次拍照的高度和倾角绝对一致）
    1. 真拍照
    2. VLM 识图找像素
    3. hand-eye 算物理坐标 (校准时已包含偏置)
    4. 执行指向任务 (移动到目标上方，然后下降指明位置)
    """
    print(f"\n[多模态] 进入智能移动/指向流程，任务: {prompt_text}")
    print("0. 眼在手上模式：强制回 Home 姿态准备拍照...")
    back_zero()
    
    print("1. 调用真实摄像头拍照...")
    from camera import capture_image
    try:
        capture_image(IMG_PATH)
    except Exception as e:
        print(f"拍照失败拦截: {e}，流程熔断！")
        return
    
    print("2. 图片发送给 Vision Grounding 大模型...")
    vlm_result = find_target_coordinates(IMG_PATH, prompt_text)
    
    if "start_xyxy" not in vlm_result:
        print("❌ VLM 没有返回正确的坐标结构，请检查 prompt 或 VLM 响应内容！", vlm_result)
        return

    # 由于当前是指向任务，我们只需提取主要目标 (start) 进行指向即可
    # 增加类型保护，防止大模型抽风返回了一维数组或者非标准结构
    start_box = vlm_result["start_xyxy"]
    if not isinstance(start_box, list) or len(start_box) < 2 or not isinstance(start_box[0], list):
        print("❌ VLM 返回的坐标结构不对（不是 [[x1,y1], [x2,y2]] 的格式）！", start_box)
        return

    sx_c = (start_box[0][0] + start_box[1][0]) / 2
    sy_c = (start_box[0][1] + start_box[1][1]) / 2

    print(f"-> VLM 解析出像素中心点: 目标({sx_c}, {sy_c})")
    
    print("3. 手眼标定: 映射为桌面毫米坐标...")
    sx_mc, sy_mc = eye2hand(sx_c, sy_c)
    print(f"-> 换算机械臂工作坐标: 目标({sx_mc}, {sy_mc})")

    print("4. 执行三维指向流: 移到上方 -> 下降指向 -> 停留展示 -> 归零")
    # 步骤 A：去目标点上方
    move_to_coords(sx_mc, sy_mc)
    
    # 步骤 B：下降进行指向 (Z=50 停下并保持姿态，避免末端直接戳到桌面)
    print(f"   (下降指向目标点 {sx_mc}, {sy_mc})")
    mc.send_coords([sx_mc, sy_mc, 50, -180, 0, 0], 30, 1)
    time.sleep(3)  # 悬停展示
    
    # 步骤 C：离开，回安全高度
    move_to_coords(sx_mc, sy_mc)
    back_zero()
    print("✅ 指向任务完成！")


# ============== 动作调度执行器 =================

ACTION_MAP = {
    "back_zero": back_zero,
    "relax_arms": relax_arms,
    "pump_on": pump_on,
    "pump_off": pump_off,
    "vlm_move": vlm_move,
    "move_to_coords": move_to_coords
}

def execute_plan(plan_json):
    print(f"\n[🤖 智能体回复]: {plan_json.get('response', '')}\n")
    
    funcs = plan_json.get("functions", [])
    for action in funcs:
        func_name = action.get("name")
        args = action.get("args", {})
        
        if func_name in ACTION_MAP:
            try:
                ACTION_MAP[func_name](**args)
            except Exception as e:
                print(f"[❌ 执行失败] {func_name} 报错: {e}")
                print("触发硬件保护，强制回零。")
                back_zero()
                break
        else:
            print(f"[警告] 函数 '{func_name}' 未在执行器中注册！跳过。")


if __name__ == '__main__':
    # 你可以直接跑这个文件测试。
    # 如果检测不到真实设备，会自动切入上面写的虚拟 Dummy 打印模式。
    test_plan = {
      "functions": [
        {"name": "back_zero", "args": {}},
        {"name": "vlm_move", "args": {"prompt_text": "帮我指一下图中的烟盒"}}
      ],
      "response": "收到，我马上指出烟盒的位置。"
    }
    execute_plan(test_plan)
