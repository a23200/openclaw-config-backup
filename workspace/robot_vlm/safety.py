import json
import math
from pathlib import Path

CONFIG_PATH = Path(__file__).resolve().parent / 'config' / 'calibration.example.json'

def load_workspace_limits():
    """读取安全边界"""
    with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
        cfg = json.load(f)
        return cfg.get("workspace", {})

def check_boundaries(x, y):
    """
    检查坐标是否在机械臂允许的物理边界内，
    防止撞击桌面或超行程损坏。
    """
    limits = load_workspace_limits()
    x_min, x_max = limits.get('x_min', -350), limits.get('x_max', 250)
    y_min, y_max = limits.get('y_min', -250), limits.get('y_max', 50)
    
    if not (x_min <= x <= x_max):
        raise ValueError(f"X坐标越界! 当前: {x}, 允许范围: {x_min} ~ {x_max}")
    if not (y_min <= y <= y_max):
        raise ValueError(f"Y坐标越界! 当前: {y}, 允许范围: {y_min} ~ {y_max}")
    
    # 增加“机械臂底座死区（内圈防打架）”保护
    # 当坐标离底座原点太近时，为了保持末端朝下的姿态，关节会发生自碰撞
    radius = math.hypot(x, y)
    if radius < 120:
        raise ValueError(f"目标太靠近底座死区 (距离底座仅 {radius:.1f}mm)！机械臂关节会打架，请把物体放远一点。")
    
    return True

if __name__ == '__main__':
    # 测试越界拦截
    try:
        check_boundaries(300, -100)
    except ValueError as e:
        print("拦截成功:", e)
    
    # 测试死区拦截
    try:
        check_boundaries(-50, -50)
    except ValueError as e:
        print("拦截成功:", e)