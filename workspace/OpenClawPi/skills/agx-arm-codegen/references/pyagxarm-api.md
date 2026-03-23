# pyAgxArm API 速查与最小可运行模板

供 OpenClaw 根据用户自然语言生成机械臂控制代码时参考。SDK 来源：pyAgxArm（[GitHub](https://github.com/agilexrobotics/pyAgxArm)）；示例参考：`pyAgxArm/demos/nero/test1.py`。

## 1. 连接与配置

```python
from pyAgxArm import create_agx_arm_config, AgxArmFactory

# 配置：robot 可选 nero / piper / piper_h / piper_l / piper_x；channel 如 can0
robot_cfg = create_agx_arm_config(
    robot="nero",
    comm="can",
    channel="can0",
    interface="socketcan",
)
robot = AgxArmFactory.create_arm(robot_cfg)
robot.connect()
```

- `create_agx_arm_config(robot, comm="can", channel="can0", interface="socketcan", **kwargs)`：创建配置字典；CAN 相关参数通过 kwargs 传入（如 channel、interface）。
- `AgxArmFactory.create_arm(config)`：返回机械臂驱动实例。
- `robot.connect()`：建立 CAN 连接并启动读取线程。

## 2. 使能与模式

```python
robot.set_normal_mode()   # 普通模式（单臂控制）
# 使能：轮询直到成功
while not robot.enable():
    time.sleep(0.01)

robot.set_speed_percent(100)   # 运动速度百分比 0–100
# 失能
while not robot.disable():
    time.sleep(0.01)
```

- 主从模式（Nero/Piper 等）：`robot.set_master_mode()`（零力拖拽）、`robot.set_slave_mode()`（跟随主臂）。

## 3. 运动模式与运动接口

| 模式 | 常量 | 接口 | 说明 |
|------|------|------|------|
| 关节位置速度 | `robot.MOTION_MODE.J` | `robot.move_j([j1..j7])` | 7 个关节角（弧度），有平滑 |
| 关节快速响应 | `robot.MOTION_MODE.JS` | `robot.move_js([j1..j7])` | 无平滑，慎用 |
| 点到点 | `robot.MOTION_MODE.P` | `robot.move_p([x,y,z,roll,pitch,yaw])` | 笛卡尔位姿，米/弧度 |
| 直线 | `robot.MOTION_MODE.L` | `robot.move_l([x,y,z,roll,pitch,yaw])` | 直线轨迹 |
| 圆弧 | `robot.MOTION_MODE.C` | `robot.move_c(start_pose, mid_pose, end_pose)` | 每 pose 6 个浮点数 |

- 单位：关节角为**弧度**；笛卡尔位姿为**米**（x,y,z）和**弧度**（roll, pitch, yaw）。
- Nero 为 7 关节；Piper 为 6 关节，`move_j`/`move_js` 参数数量需与机型一致。

示例（关节运动 + 等待完成）：

```python
import time

def wait_motion_done(robot, timeout: float = 3.0, poll_interval: float = 0.1) -> bool:  # Shorter timeout (2-3s)
    time.sleep(0.5)
    start_t = time.monotonic()
    while True:
        status = robot.get_arm_status()
        if status is not None and getattr(status.msg, "motion_status", None) == 0:
            return True
        if time.monotonic() - start_t > timeout:
            return False
        time.sleep(poll_interval)

robot.set_motion_mode(robot.MOTION_MODE.J)
robot.move_j([0.01, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0])
wait_motion_done(robot, timeout=3.0)  # Shorter timeout
```

## 4. 读取状态

- `robot.get_joint_angles()`：当前关节角（返回值带 `.msg` 属性时为数组）。
- `robot.get_flange_pose()`：当前法兰位姿 `[x, y, z, roll, pitch, yaw]`。
- `robot.get_arm_status()`：运动状态等；`status.msg.motion_status == 0` 表示运动完成。
- 注意：运动完成后检测 `robot.get_arm_status().msg.motion_status == 0`（不是 == 1）

## 5. 其他

- 回零：`robot.move_j([0] * 7)`（Nero 为 7 关节）。
- 急停：`robot.electronic_emergency_stop()`；恢复需 `robot.reset()`。
- MIT 阻抗/力矩控制（高级）：`robot.set_motion_mode(robot.MOTION_MODE.MIT)`，`robot.move_mit(joint_index, p_des, v_des, kp, kd, t_ff)`，参数范围见 SDK，慎用。

## 6. 最小可运行模板（生成代码时可基于此扩展）

```python
#!/usr/bin/env python3
import time
from pyAgxArm import create_agx_arm_config, AgxArmFactory


def wait_motion_done(robot, timeout: float = 3.0, poll_interval: float = 0.1) -> bool:  # Shorter timeout (2-3s)
    time.sleep(0.5)
    start_t = time.monotonic()
    while True:
        status = robot.get_arm_status()
        if status is not None and getattr(status.msg, "motion_status", None) == 0:
            return True
        if time.monotonic() - start_t > timeout:
            return False
        time.sleep(poll_interval)


def main():
    robot_cfg = create_agx_arm_config(
        robot="nero",
        comm="can",
        channel="can0",
        interface="socketcan",
    )
    robot = AgxArmFactory.create_arm(robot_cfg)
    robot.connect()

    # Mode switching requires 1s delay before and after
    time.sleep(1)  # 1s delay before mode switch
    robot.set_normal_mode()
    time.sleep(1)  # 1s delay after mode switch
    
    # CRITICAL: The robot MUST BE ENABLED before switching modes
    while not robot.enable():
        time.sleep(0.01)
    robot.set_speed_percent(80)

    # After each mechanical arm operation, add a small sleep (0.01 seconds)
    # CRITICAL: All movement commands must be used in normal mode
    robot.set_motion_mode(robot.MOTION_MODE.J)
    robot.move_j([0.05, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0])
    time.sleep(0.01)  # Small delay after move command
    wait_motion_done(robot, timeout=3.0)  # Shorter timeout

    # 可选：退出前失能
    # while not robot.disable():
    #     time.sleep(0.01)


if __name__ == "__main__":
    main()
```

生成代码时请根据用户描述替换或增加运动步骤（`move_j` / `move_p` / `move_l` / `move_c` 等），并保持连接、使能、`wait_motion_done` 和单位（弧度/米）一致。
