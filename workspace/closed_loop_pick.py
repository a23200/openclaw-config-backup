# -*- coding: UTF-8 -*-
import time
import sys
from pymycobot.mycobot import MyCobot
import cv2
import os
import openclaw # Assuming openclaw has a library for tool calls

# --- 全局配置 ---
port = "/dev/tty.usbserial-54F70030501"
baudrate = 115200

# --- 视觉分析函数 ---
def analyze_image_for_object_center(image_path, image_width, image_height):
    """
    使用 OpenClaw 的 image 工具分析图片，返回物体的中心坐标和图像中心坐标。
    如果找不到物体，返回 None。
    """
    print(f"正在分析图片: {image_path}...")
    # This is a placeholder for the actual tool call.
    # In a real OpenClaw script, you would use the provided bindings.
    # For this simulation, we'll return a hardcoded plausible value.
    # response = openclaw.tools.image(image=image_path, prompt="Find the cigarette box and return its bounding box [x,y,w,h]")
    # For now, let's pretend it found the object slightly off-center.
    # Let's say image center is (640, 360) for a 1280x720 image.
    # And the object is found at x=700, y=340.
    
    # --- SIMULATED RESPONSE ---
    # In a real run, this comes from the vision model
    box_x, box_y, box_w, box_h = (700, 340, 180, 360) 
    # --- END SIMULATION ---

    obj_center_x = box_x + box_w / 2
    obj_center_y = box_y + box_h / 2
    img_center_x = image_width / 2
    img_center_y = image_height / 2

    print(f"图像中心: ({img_center_x}, {img_center_y})")
    print(f"物体中心: ({obj_center_x}, {obj_center_y})")
    
    return (obj_center_x, obj_center_y), (img_center_x, img_center_y)

# --- 动作函数 (从之前脚本复用) ---
def move_arm(cobot, position, speed=30, delay=3):
    print(f"移动到: {position}, 速度: {speed}")
    cobot.send_angles(position, speed)
    time.sleep(delay)

def control_gripper(cobot, state, speed=70, delay=2):
    action = "张开" if state == 0 else "闭合"
    print(f"{action}抓夹...")
    cobot.set_gripper_state(state, speed)
    time.sleep(delay)

def capture_image(filename="capture.jpg"):
    print(f"正在拍照并保存为 {filename}...")
    cap = cv2.VideoCapture(0)
    if not cap.isOpened(): return False, None, None
    ret, frame = cap.read()
    if not ret: return False, None, None
    cv2.imwrite(filename, frame)
    height, width, _ = frame.shape
    cap.release()
    print("拍照完成。")
    return True, width, height

# --- 主程序 ---
if __name__ == "__main__":
    try:
        cobot = MyCobot(port, baudrate)
        print("已连接机械臂，开始执行闭环控制抓取流程...")

        # --- 步骤 1: 初步定位 (开环) ---
        print("\n--- 步骤 1: 初步定位 ---")
        # For this test, we go directly to a known "ready" position
        # This is the "approach" position for 'middle-right' from the last successful script
        initial_approach_pos = [24.6, -40.0, -50.0, -0.3, -109.8, 164.0]
        move_arm(cobot, initial_approach_pos)

        # --- 步骤 2: 二次校准 (闭环) ---
        print("\n--- 步骤 2: 二次拍照并进行微调 ---")
        success, img_w, img_h = capture_image("correction_view.jpg")
        if not success:
            raise Exception("二次拍照失败")

        # 分析图像，获取偏差
        # NOTE: The analyze_image function is currently SIMULATED
        obj_center, img_center = analyze_image_for_object_center("correction_view.jpg", img_w, img_h)
        
        error_x = obj_center[0] - img_center[0]
        error_y = obj_center[1] - img_center[1]
        print(f"像素偏差 (X, Y): ({error_x:.1f}, {error_y:.1f})")

        # 将像素偏差转换为角度校正量 (这是关键的估算部分)
        # P-gain: 像素偏差到角度的转换系数，需要实验调整
        gain_j1 = -0.03 # X-axis error affects J1 (base rotation). Negative gain because positive angle is CCW.
        gain_j2 = 0.03  # Y-axis error affects J2 (forward/back). Positive gain.
        
        correction_j1 = error_x * gain_j1
        correction_j2 = error_y * gain_j2
        print(f"角度校正量 (J1, J2): ({correction_j1:.2f}, {correction_j2:.2f})")

        # 获取当前角度并应用校正
        current_angles = cobot.get_angles()
        corrected_angles = list(current_angles)
        corrected_angles[0] += correction_j1
        corrected_angles[1] += correction_j2
        
        print("应用微调校正...")
        move_arm(cobot, corrected_angles, speed=15, delay=4)

        # --- 步骤 3: 最终抓取 ---
        print("\n--- 步骤 3: 执行最终抓取 ---")
        # 从校正后的位置，计算最终的“下降”位置
        final_pick_pos = list(corrected_angles)
        # 调整J2和J3以实现下降 (基于我们手动校准的经验)
        final_pick_pos[1] = -72.3 # Target J2 from manual calibration
        final_pick_pos[2] = -10.6 # Target J3 from manual calibration
        
        control_gripper(cobot, 0) # 确保抓夹是张开的
        move_arm(cobot, final_pick_pos, speed=15, delay=5)
        control_gripper(cobot, 1) # 抓
        move_arm(cobot, corrected_angles, speed=20) # 抬起

        # --- 步骤 4: 放置并回家 ---
        print("\n--- 步骤 4: 放置并返回 ---")
        drop_off_pos = [90, 0, -45, 0, 50, 0]
        move_arm(cobot, drop_off_pos)
        control_gripper(cobot, 0)
        move_arm(cobot, [0,0,0,0,0,0])

        print("闭环控制抓取流程完成！")

    except Exception as e:
        print(f"发生严重错误: {e}")

