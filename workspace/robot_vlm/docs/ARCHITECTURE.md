# 机械臂 VLM 工作流设计

## 总流程
1. 用户输入自然语言指令
2. LLM 将指令编排成结构化 action plan
3. 如果涉及视觉抓取/移动：
   - 采集俯视图
   - 调用 VLM 提取 start/end 目标框
   - 计算中心点像素坐标
   - 用 hand-eye 标定参数转换为机械臂平面坐标
4. 执行器按顺序下发机械臂动作
5. 回传执行结果

## 模块拆分
### 1. planner
负责把自然语言解析为结构化动作序列。

### 2. vision_grounding
负责将图像 + 指令发送给 VLM，返回目标框。

### 3. calibration
负责像素坐标 -> 机械臂坐标映射。
当前先采用双点线性插值法，后续可升级。

### 4. executor
负责 back_zero / move / pump / single_joint_move 等动作执行。

### 5. safety
负责坐标边界检查、回原点、异常停止。

## 明天开工顺序
1. 补 prompts
2. 写 JSON schema
3. 写测试版 planner
4. 写 calibration
5. 接现有机械臂动作接口
