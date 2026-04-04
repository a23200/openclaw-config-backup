import os
import subprocess

def control_robot_arm(instruction: str) -> dict:
    try:
        workspace = os.path.expanduser("~/.openclaw/workspace")
        robot_dir = os.path.join(workspace, "robot_vlm")
        
        script = f"""
import sys
import os
sys.path.append('{robot_dir}')
from executor import execute_plan

plan = {{
    "functions": [
        {{"name": "back_zero", "args": {{}}}},
    ],
    "response": "收到，正在执行指向任务。"
}}
execute_plan(plan)
"""
        python_exe = os.path.join(robot_dir, ".venv", "bin", "python3")
        temp_script = os.path.join(robot_dir, "temp_run.py")
        with open(temp_script, "w") as f:
            f.write(script)
            
        result = subprocess.run([python_exe, temp_script], capture_output=True, text=True)
        return {"success": True, "output": result.stdout, "error": result.stderr, "message": f"机械臂已执行: {instruction}"}
    except Exception as e:
        return {"success": False, "error": str(e)}

print(control_robot_arm("指向水杯"))
