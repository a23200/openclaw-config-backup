import time
import json
from pymycobot.mycobot import MyCobot

port = "/dev/tty.usbserial-54F70030501"
baudrate = 115200

# 定义安全扫描矩阵 (共 3x3x2 = 18 个测试点)
# J1: 左右摇摆
j1_list = [-30, 0, 30]
# J2: 大臂上下 (负数后仰，正数前压)
j2_list = [-10, 10, 30]
# J3: 小臂收缩 (负数向内收)
j3_list = [-50, -20]

# 手腕固定姿态，确保爪子朝向相对统一且安全
j4, j5, j6 = 0, 50, 0

data_set = []

def get_stable_coords(cobot):
    for _ in range(5):
        coords = cobot.get_coords()
        if coords: return coords
        time.sleep(0.2)
    return None

if __name__ == "__main__":
    try:
        cobot = MyCobot(port, baudrate)
        print("====== 核心物理引擎：全维度空间扫描启动 ======")
        print(f"预计采集 18 组核心映射数据...\n")
        
        # 先抬高到一个绝对安全的起始点
        cobot.send_angles([0, 0, 0, 0, 0, 0], 30)
        time.sleep(3)

        count = 1
        for j1 in j1_list:
            for j2 in j2_list:
                for j3 in j3_list:
                    target_angles = [j1, j2, j3, j4, j5, j6]
                    print(f"[{count}/18] 正在驱动关节至: {target_angles} ...")
                    
                    # 发送角度指令
                    cobot.send_angles(target_angles, 30)
                    time.sleep(2.5) # 给足物理运动和镇定时间
                    
                    # 读取空间反馈
                    coords = get_stable_coords(cobot)
                    
                    if coords:
                        print(f"       -> 抓取到底层空间反馈: X:{coords[0]:.1f}, Y:{coords[1]:.1f}, Z:{coords[2]:.1f}")
                        data_set.append({
                            "angles": target_angles,
                            "coords": coords
                        })
                    else:
                        print("       -> 警告：底层坐标反馈丢失，跳过此点。")
                    
                    count += 1

        # 保存为我自己的“物理引擎词典”
        with open("kinematics_data.json", "w") as f:
            json.dump(data_set, f, indent=4)

        print("\n✅ 数据采集完毕！已生成 kinematics_data.json，正在回位...")
        cobot.send_angles([0, 0, 0, 0, 0, 0], 30)
        time.sleep(3)
        print("====== 学习阶段一：空间矩阵建立完成！ ======")

    except Exception as e:
        print(f"发生致命错误: {e}")
