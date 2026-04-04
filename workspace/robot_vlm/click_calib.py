import cv2
import json
from pathlib import Path

CONFIG_PATH = Path(__file__).resolve().parent / 'config' / 'calibration_3pt.json'
IMG_PATH = str(Path(__file__).resolve().parent / "temp" / "calib_3pt.jpg")

with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
    cfg = json.load(f)

img = cv2.imread(IMG_PATH)
if img is None:
    print("找不到 calib_3pt.jpg！请先运行标定脚本拍照。")
    exit(1)

points = []
names = ["烟盒", "鼠标", "打火机"]

def mouse_callback(event, x, y, flags, param):
    if event == cv2.EVENT_LBUTTONDOWN:
        if len(points) < 3:
            points.append([x, y])
            cv2.circle(img_disp, (x, y), 5, (0, 0, 255), -1)
            cv2.putText(img_disp, names[len(points)-1], (x+10, y), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
            cv2.imshow("Click 3 Points", img_disp)
            print(f"已点击 {names[len(points)-1]} 像素: {x}, {y}")

img_disp = img.copy()
cv2.namedWindow("Click 3 Points", cv2.WINDOW_NORMAL)
cv2.resizeWindow("Click 3 Points", 1280, 720)
cv2.setMouseCallback("Click 3 Points", mouse_callback)

print("\n===============================")
print("👉 请在弹出的窗口中，按刚才你物理示教的顺序，依次点击：")
print("1. 烟盒的中心")
print("2. 鼠标的中心")
print("3. 打火机的中心")
print("🎯 【注意】点击完 3 个点后，程序会自动保存并退出！")
print("===============================\n")

cv2.imshow("Click 3 Points", img_disp)

# 轮询循环，点满3个自动退出，或者按 q/ESC 强制退出
while True:
    key = cv2.waitKey(100) & 0xFF
    if len(points) == 3:
        cv2.waitKey(500) # 稍微停顿半秒让你看清最后一个点
        break
    if key == 27 or key == ord('q'): 
        break

cv2.destroyAllWindows()
cv2.waitKey(1) # macOS 特性：需要多跑一次 waitKey(1) 才能真正关掉 GUI 窗口

if len(points) == 3:
    cfg["image_pt1"] = points[0]
    cfg["image_pt2"] = points[1]
    cfg["image_pt3"] = points[2]
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, indent=2)
    print("\n✅ 完美！最精准的像素坐标已保存。现在你可以放手让它去抓了！")
else:
    print("\n❌ 未点满 3 个点，已取消保存。")
