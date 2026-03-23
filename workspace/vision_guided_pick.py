import time
from pymycobot.mycobot import MyCobot
import sys

# 硬件连接配置
port = "/dev/tty.usbserial-54F70030501"
baudrate = 115200

# --- 关键位置定义 ---
# 基础位置
home_pos = [0, 0, 0, 0, 0, 0]
drop_off_pos = [90, 0, -45, 0, 50, 0] # 统一的放置位置

# 根据视觉定位结果调整的抓取位置
# 'middle-center': [0, 45, -90, 0, 50, 0]
# 'middle-right':  [-30, 45, -90, 0, 50, 0] # J1关节向右转30度
# 'middle-left':   [30, 45, -90, 0, 50, 0] # J1关节向左转30度
location_map = {
    "middle-center": {
        "approach": [0, 20, -60, 0, 50, 0],
        "pick": [0, 45, -90, 0, 50, 0]
    },
    "middle-right": {
        "approach": [24.6, -40.0, -50.0, -0.3, -109.8, 164.0],
        "pick": [24.6, -72.3, -10.6, -0.3, -109.8, 164.0]
    },
    "middle-left": {
        "approach": [30, 20, -60, 0, 50, 0],
        "pick": [30, 45, -90, 0, 50, 0]
    }
    # 可以在这里添加更多位置的坐标
}

# --- 封装的动作函数 ---
def move_arm(cobot, position, speed=30, delay=3):
    print(f"移动到: {position}, 速度: {speed}")
    cobot.send_angles(position, speed)
    time.sleep(delay)

def control_gripper(cobot, state, speed=70, delay=2):
    action = "张开" if state == 0 else "闭合"
    print(f"{action}抓夹...")
    cobot.set_gripper_state(state, speed)
    time.sleep(delay)

# --- 主程序 ---
if __name__ == "__main__":
    # 从命令行参数获取目标位置，如果没有，则默认为'middle-center'
    # 在这个测试中，我们直接用视觉结果 'middle-right'
    target_location = "middle-right"
    
    if target_location not in location_map:
        print(f"错误: 未知的位置 '{target_location}'")
        sys.exit(1)
        
    # 获取目标位置的坐标
    pick_approach_pos = location_map[target_location]["approach"]
    pick_pos = location_map[target_location]["pick"]

    try:
        cobot = MyCobot(port, baudrate)
        print(f"视觉定位成功，目标: {target_location}。开始执行抓取流程...")
        
        # 1. 回到初始位置
        move_arm(cobot, home_pos)
        
        # 2. 张开抓夹，准备抓取
        control_gripper(cobot, 0)
        
        # 3. 移动到目标上方的预备位置
        move_arm(cobot, pick_approach_pos)

        # 4. **安全下降**: 用非常慢的速度俯身到抓取位置
        move_arm(cobot, pick_pos, speed=15, delay=5) # 降低速度，增加延时
        
        # 5. 闭合抓夹
        control_gripper(cobot, 1)
        
        # 6. 抬起
        move_arm(cobot, pick_approach_pos, speed=20)
        
        # 7. 移动到固定的放置位置
        move_arm(cobot, drop_off_pos)
        
        # 8. 张开抓夹，放下物体
        control_gripper(cobot, 0)
        
        # 9. 回到初始位置
        move_arm(cobot, home_pos)
        
        print("视觉引导的抓取流程测试完成！")
        
    except Exception as e:
        print(f"发生错误: {e}")
