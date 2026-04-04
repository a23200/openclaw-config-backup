import cv2
import time

def try_cam(idx):
    print(f"Testing camera {idx}...")
    cap = cv2.VideoCapture(idx)
    if cap.isOpened():
        print(f"Camera {idx} opened. Warming up...")
        time.sleep(2)
        # 丢弃前几帧（USB 摄像头刚启动时可能是空帧或未曝光的）
        for _ in range(15):
            cap.read()
        
        ret, frame = cap.read()
        if ret:
            filename = f"captured_cam_{idx}.jpg"
            cv2.imwrite(filename, frame)
            print(f"Success! Saved image from camera {idx} as {filename}")
        else:
            print(f"Camera {idx} opened but failed to read valid frame.")
        cap.release()
    else:
        print(f"Camera {idx} could not be opened.")

# 只尝试外接的那个 (一般是1) 和默认的 (0)
for i in [1, 0]:
    try_cam(i)
