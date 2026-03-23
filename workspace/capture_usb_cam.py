
import cv2
import os

output_path = "captured_image.jpg"

def capture_image_from_usb_cam(index=0):
    # 尝试打开摄像头
    cap = cv2.VideoCapture(index)

    # 检查摄像头是否成功打开
    if not cap.isOpened():
        print(f"错误: 无法打开摄像头 {index}")
        return False

    print(f"成功打开摄像头 {index}...")

    # 读取一帧
    ret, frame = cap.read()

    # 检查是否成功读取帧
    if not ret:
        print("错误: 无法从摄像头读取帧")
        cap.release()
        return False

    # 保存图像
    cv2.imwrite(output_path, frame)
    print(f"图像已保存到: {output_path}")

    # 释放摄像头资源
    cap.release()
    return True

if __name__ == "__main__":
    capture_image_from_usb_cam()
