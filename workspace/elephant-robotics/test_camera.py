import cv2

def find_and_test_cameras():
    """
    Scans for available cameras, takes a snapshot from each, and saves it.
    """
    print("正在扫描可用的摄像头...")
    
    found_cameras = []
    # Test camera indices 0, 1, 2, 3. Most built-in/external cameras are in this range.
    for i in range(4):
        print(f"尝试打开摄像头索引 {i}...")
        cap = cv2.VideoCapture(i)
        
        if cap.isOpened():
            print(f"  摄像头 {i} 打开成功！")
            found_cameras.append(i)
            
            # Read a frame
            ret, frame = cap.read()
            if ret:
                filename = f"camera_capture_{i}.jpg"
                cv2.imwrite(filename, frame)
                print(f"  成功捕获一帧图像，已保存为: {filename}")
            else:
                print(f"  错误：无法从摄像头 {i} 读取帧。")
            
            # Release the camera
            cap.release()
            print(f"  摄像头 {i} 已释放。")
        else:
            print(f"  摄像头 {i} 未找到或无法打开。")
            
    if not found_cameras:
        print("\n结论：未找到任何可用的摄像头。")
    else:
        print(f"\n结论：测试完成！找到了 {len(found_cameras)} 个摄像头。请查看生成的 .jpg 图片。")
        print("其中一个应该就是机械臂的视角。")

if __name__ == "__main__":
    find_and_test_cameras()
