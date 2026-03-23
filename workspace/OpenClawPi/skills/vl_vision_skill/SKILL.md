---
name: vl_vision_skill
description: 当用户询问看到什么、能看到什么、需要观察周围环境/图像分析时触发，通过摄像头实时拍摄并使用Ollama qwen3.5:9b模型进行视觉分析
---

# 视觉识别技能（vl_vision_skill）

## 功能概述
该技能通过英特尔实感（RealSense）摄像头实时捕获图像，调用本地Ollama部署的qwen3.5:9b大模型进行视觉分析，返回场景描述、物体识别、环境细节等分析结果。

## 触发场景
当用户提出以下类型的请求时自动调用：
1. 询问"你看到了什么"、"能看到什么"、"帮我看看周围"
2. 要求观察环境、识别图像内容、进行视觉相关的分析
3. 其他需要通过摄像头获取实时视觉信息的场景

## 运行环境要求
1. 依赖Conda虚拟环境：`nerosdk`
2. 必需的Python依赖包：`pyrealsense2`、`opencv-python`、`ollama`、`numpy`
3. 本地需提前启动Ollama服务，并拉取`qwen3.5:9b`模型：`ollama pull qwen3.5:9b`
4. 需正确连接英特尔实感摄像头并完成系统识别

## 调用方式
### 标准调用格式
```bash
conda activate nerosdk && python /home/agilex/.nanobot/workspace/skills/vl_vision_skill/scripts/nanobot_vision.py "自定义提示词"
```

### 快速调用示例
1. 使用默认提示词（"图像中有什么"）：
```bash
conda run -n nerosdk python /home/agilex/.nanobot/workspace/skills/vl_vision_skill/scripts/nanobot_vision.py
```

2. 自定义提示词（详细描述周围环境）：
```bash
conda run -n nerosdk python /home/agilex/.nanobot/workspace/skills/vl_vision_skill/scripts/nanobot_vision.py "请详细描述我周围的环境，包括物体位置和场景氛围"
```

## 输出处理规则
技能会自动将模型返回的原始分析结果进行结构化整理，以清晰易懂的格式输出给用户，包含：
1. 识别到的核心物体、人物、设备等细节
2. 场景环境描述（空间布局、装饰、工作氛围等）
3. 可选的自定义分析维度（根据用户指定的提示词调整）

## 常见问题
1. 若提示"No device connected"：请检查摄像头是否正确连接并被系统识别
2. 若提示模型连接失败：请确认Ollama服务已正常启动
3. 若提示依赖缺失：请在`nerosdk`环境中执行依赖安装命令：`pip install pyrealsense2 opencv-python ollama numpy`
