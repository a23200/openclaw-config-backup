import cv2
import time

def try_cam(idx):
    print(f"Testing camera {idx}...")
    cap = cv2.VideoCapture(idx)
    if cap.isOpened():
        # 给 USB 摄像头留出1.5秒的启动对焦和曝光时间
        time.sleep(1.5) 
        ret, frame = cap.read()
        if ret:
            filename = f"captured_cam_{idx}.jpg"
            cv2.imwrite(filename, frame)
            print(f"Success! Saved image from camera {idx} as {filename}")
        else:
            print(f"Camera {idx} opened but failed to read frame.")
        cap.release()
    else:
        print(f"Camera {idx} could not be opened.")

for i in range(3):
    try_cam(i)
