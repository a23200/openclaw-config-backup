import cv2

success = False
for i in [1, 0, 2]:
    print(f"Trying camera index {i}...")
    cap = cv2.VideoCapture(i)
    if cap.isOpened():
        ret, frame = cap.read()
        if ret:
            cv2.imwrite('captured_image.jpg', frame)
            print(f"Success! Captured fresh image from camera {i} and saved as 'captured_image.jpg'.")
            success = True
            cap.release()
            break
        cap.release()

if not success:
    print("Failed to capture image from any camera index.")
