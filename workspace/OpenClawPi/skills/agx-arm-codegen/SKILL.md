---
name: agx-arm-codegen
description: 引导 OpenClaw 根据用户自然语言生成基于 pyAgxArm 的机械臂控制代码。当用户用提示词描述机械臂动作且现有脚本无法直接满足时，根据本技能提供的 API 与示例自动组织并生成可执行的 Python 脚本。
metadata:
  {
    "openclaw":
      {
        "emoji": "🤖",
        "requires": { "bins": ["python3", "pip3"] },
      },
  }
---

## 功能概览

- 本技能用于**根据用户自然语言描述**，引导 OpenClaw **生成**可执行的 pyAgxArm 控制代码（Python 脚本），而不是仅调用现成 CLI。
- 参考 SDK：pyAgxArm（[GitHub](https://github.com/agilexrobotics/pyAgxArm)）；参考示例：`pyAgxArm/demos/nero/test1.py`。

## 何时使用本技能

- 用户说「写一段代码控制机械臂」「根据我的描述生成控制脚本」「让机械臂按顺序做多个动作」等。
- 用户明确要求「生成 Python 代码」或「给我可运行的脚本」来控制 Nero/Piper 等 AgileX 机械臂。

## 使用本技能生成代码
   - 根据用户提示词，结合本技能的 `references/pyagxarm-api.md` 中的 API 与模板，生成一段完整、可运行的 Python 脚本。
   - 生成后说明：脚本需在已安装 pyAgxArm 和 python-can 的环境中运行，且需 CAN 已激活、机械臂上电；提醒用户注意安全（工作区域无人、可先小幅度测试）。

## 生成代码时的规则

1. **连接与配置**
   - 使用 `create_agx_arm_config(robot="nero", comm="can", channel="can0", interface="socketcan")` 创建配置（Nero 示例；Piper 可用 `robot="piper"`）。
   - 使用 `AgxArmFactory.create_arm(robot_cfg)` 创建机械臂实例，再 `robot.connect()` 建立连接。
2. **使能与运动前**
   - CRITICAL: The robot MUST BE ENABLED before switching modes. If the robot is in a disabled state, you cannot switch modes.
   - 运动前需切换为普通模式，让后使能：`robot.set_normal_mode()`，然后轮询 `robot.enable()` 直到成功；可设 `robot.set_speed_percent(100)`。
   - 运动模式：每当需要使用move_*时或需要切换为*模式时候，需要显式的设置`robot.set_motion_mode(robot.MOTION_MODE.J)`（关节）、`P`（点到点）、`L`（直线）、`C`（圆弧）、`JS`（关节快速响应，慎用）。
3. **运动接口与单位**
   - 关节运动：`robot.move_j([j1, j2, ..., j7])`，单位为**弧度**，Nero 为 7 关节。
   - 笛卡尔：`robot.move_p(pose)` / `robot.move_l(pose)`，pose 为 `[x, y, z, roll, pitch, yaw]`，位置单位**米**，姿态**弧度**。
   - 圆弧：`robot.move_c(start_pose, mid_pose, end_pose)`，每个 pose 为 6 个浮点数。
   - CRITICAL: All movement commands (move_j, move_js, move_mit, move_c, move_l, move_p) must be used in normal mode
   - 运动完成后应轮询 `robot.get_arm_status().msg.motion_status == 0` 或封装 `wait_motion_done(robot, timeout=...)` 再执行下一步。
4. **模式切换**
   - Switching modes (master, slave, normal) requires 1s delay before and after the mode switch
   - Use `robot.set_normal_mode()` to set normal mode
   - Use `robot.set_master_mode()` to set master mode
   - Use `robot.set_slave_mode()` to set slave mode
   - CRITICAL: Enable the robot FIRST with `robot.enable()` BEFORE switching modes
5. **安全与结尾**
   - 在生成脚本中可注明：执行前确认工作区域安全；首次建议小幅度移动；紧急时使用物理急停或 `robot.electronic_emergency_stop()` / `robot.disable()`。
   - 若用户要求「完成后失能」，在脚本末尾调用 `robot.disable()`。
6. **实现细节**
   - When waiting for motion to complete, use shorter timeout (2-3 seconds)
   - After each mechanical arm operation, add a small sleep (0.01 seconds)
   - Motion completion detection: `robot.get_arm_status().msg.motion_status == 0` (not == 1)

## 参考文件

- **API 与最小可运行模板**：`references/pyagxarm-api.md`  
  生成代码时请结合该文件中的接口说明与代码片段，保证与 pyAgxArm 及 test1.py 用法一致。

## 安全注意事项

- 生成的代码会驱动真实机械臂，必须提醒用户：执行前确认工作区域内无人员和障碍物；建议先小幅度、低速度测试。
- 高风险模式（如 `move_js`、`move_mit`）应在代码注释或对用户说明中标注风险，并建议仅在了解后果后使用。
- 本技能只负责「引导生成代码」，不直接执行运动；实际运行环境、CAN 激活、pyAgxArm 安装由用户自行准备（可参考 agx-arm 技能中的环境准备）。
