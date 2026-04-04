import cv2
import time
from pathlib import Path

def capture_image(save_path: str):
    """
    捕捉单张图片并保存到指定路径。
    注意：macOS 上首次运行可能需要授权摄像头权限（Terminal / OpenClaw 需要相机权限）。
    """
    print(f"尝试连接本机摄像头...")
    # 0 通常是内置或默认外接摄像头。如果是外接摄像头有多个，可以尝试改 1
    cap = cv2.VideoCapture(0)
    
    if not cap.isOpened():
        raise RuntimeError("无法打开摄像头！请检查 USB 连接或 macOS 隐私设置。")

    # 预热摄像头，防止刚打开时画面曝光不足或者是黑帧
    time.sleep(1)
    
    ret, frame = cap.read()
    if not ret:
        cap.release()
        raise RuntimeError("摄像头捕获画面失败！")
    
    # 水平翻转图像，修正镜像问题
    flipped_frame = cv2.flip(frame, 1)
    
    # 确保存储目录存在
    Path(save_path).parent.mkdir(parents=True, exist_ok=True)
    
    cv2.imwrite(save_path, flipped_frame)
    print(f"拍照成功，已保存至: {save_path}")
    
    cap.release()
    return save_path

if __name__ == "__main__":
    capture_image(str(Path(__file__).resolve().parent / "temp" / "test_camera.jpg"))