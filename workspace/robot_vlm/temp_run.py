
import sys
import os
sys.path.append('/Users/mac/.openclaw/workspace/robot_vlm')
from executor import execute_plan


if "回原点" in ["回原点", "复位", "回到home", "回到原点", "home"]:
    plan = {
        "functions": [
            {"name": "back_zero", "args": {}}
        ],
        "response": "收到，正在让机械臂回原点。"
    }
else:
    plan = {
        "functions": [
            {"name": "back_zero", "args": {}},
            {"name": "vlm_move", "args": {"prompt_text": "回原点"}}
        ],
        "response": "收到，正在执行指向任务。"
    }

execute_plan(plan)
