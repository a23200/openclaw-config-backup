import time
import cv2
from pymycobot.mycobot import MyCobot

port = "/dev/tty.usbserial-54F70030501"
baudrate = 115200

def capture(filename):
    cap = cv2.VideoCapture(0)
    time.sleep(1) # 暖机，让摄像头对焦和曝光稳定
    ret, frame = cap.read()
    if ret:
        cv2.imwrite(filename, frame)
        print(f"保存图像成功: {filename}")
    else:
        print(f"拍照失败: {filename}")
    cap.release()

if __name__ == "__main__":
    try:
        cobot = MyCobot(port, baudrate)
        print("机械臂已连接，准备开始硬核自我标定...")

        # 1. 回到我们之前手动的悬停位置
        start_angles = [98.3, 20.0, -20.0, -145.0, -48.5, 0.3]
        cobot.send_angles(start_angles, 30)
        time.sleep(4)

        # 2. 读取当前真实空间坐标 (X, Y, Z, Rx, Ry, Rz)
        coords = None
        for _ in range(5):
            coords = cobot.get_coords()
            if coords:
                break
            time.sleep(0.5)

        if not coords:
            print("获取底层空间坐标失败，请检查通信。")
            exit(1)

        print(f"获取到原点空间直角坐标: {coords}")
        capture("calib_origin.jpg")

        # 3. 沿 X 轴物理平移 30 毫米 (高级逆运动学指令)
        coords_x = list(coords)
        coords_x[0] += 30.0
        print(f"尝试沿X轴平移30毫米，目标坐标: {coords_x}")
        try:
            cobot.send_coords(coords_x, 20, 1) # 1代表走直线轨迹
        except TypeError:
            cobot.send_coords(coords_x, 20) # 兼容老版本API
        time.sleep(3)
        capture("calib_x.jpg")

        # 4. 回原点，再沿 Y 轴物理平移 30 毫米
        print("回原点...")
        try:
            cobot.send_coords(coords, 20, 1)
        except TypeError:
            cobot.send_coords(coords, 20)
        time.sleep(3)

        coords_y = list(coords)
        coords_y[1] += 30.0
        print(f"尝试沿Y轴平移30毫米，目标坐标: {coords_y}")
        try:
            cobot.send_coords(coords_y, 20, 1)
        except TypeError:
            cobot.send_coords(coords_y, 20)
        time.sleep(3)
        capture("calib_y.jpg")

        # 5. 回到原点待命
        try:
            cobot.send_coords(coords, 20, 1)
        except TypeError:
            cobot.send_coords(coords, 20)
        print("物理平移测试与拍照完成！请AI接管处理。")

    except Exception as e:
        print(f"发生错误: {e}")