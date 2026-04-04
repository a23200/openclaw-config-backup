#!/usr/bin/env python3
"""
如意 (MOSS) MCP Server - OpenClaw 工具集
通过小智语音调用 OpenClaw 能力
"""
from mcp.server.fastmcp import FastMCP
import subprocess
import os
import platform
from datetime import datetime
import time
import json

mcp = FastMCP("如意-MOSS")


@mcp.tool()
def calculator(python_expression: str) -> dict:
    """数学计算工具。用于计算数学表达式。"""
    try:
        result = eval(python_expression)
        return {"success": True, "result": result}
    except Exception as e:
        return {"success": False, "error": str(e)}


@mcp.tool()
def open_browser(url: str = "") -> dict:
    """打开浏览器。用于打开网站或浏览器。"""
    try:
        system = platform.system()
        if system == "Darwin":
            cmd = ["open", "-a", "Google Chrome"] + ([url] if url else [])
        elif system == "Linux":
            cmd = ["google-chrome"] + ([url] if url else [])
        else:
            return {"success": False, "error": "Unsupported OS"}
        
        subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return {"success": True, "message": f"浏览器已打开" + (f"，访问 {url}" if url else "")}
    except Exception as e:
        return {"success": False, "error": str(e)}


@mcp.tool()
def get_current_time() -> dict:
    """获取当前时间。用于查询当前日期和时间。"""
    now = datetime.now()
    return {"success": True, "time": now.strftime("%Y-%m-%d %H:%M:%S")}


@mcp.tool()
def list_files(path: str = ".") -> dict:
    """列出目录文件。用于查看工作目录的内容。"""
    try:
        workspace = os.path.expanduser("~/.openclaw/workspace")
        if not path.startswith('/'):
            target = os.path.join(workspace, path)
        else:
            target = path
        
        if not target.startswith(workspace):
            target = workspace
        
        files = sorted(os.listdir(target))[:20]
        return {"success": True, "files": files, "path": target}
    except Exception as e:
        return {"success": False, "error": str(e)}


@mcp.tool()
def read_file(filename: str) -> dict:
    """读取文件内容。用于查看文件内容。"""
    try:
        workspace = os.path.expanduser("~/.openclaw/workspace")
        if '/' not in filename:
            filepath = os.path.join(workspace, filename)
        else:
            filepath = os.path.expanduser(filename)
        
        if not filepath.startswith(workspace):
            return {"success": False, "error": "只能读取 workspace 目录下的文件"}
        
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read(5000)
        
        return {"success": True, "content": content, "filename": filename}
    except Exception as e:
        return {"success": False, "error": str(e)}


@mcp.tool()
def run_command(command: str) -> dict:
    """执行Shell命令。用于运行系统命令或检查系统状态。"""
    try:
        dangerous = ['rm -rf', 'mkfs', '> /dev', 'dd if=', 'curl', 'wget']
        for d in dangerous:
            if d in command.lower():
                return {"success": False, "error": "危险命令已被阻止"}
        
        result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=30)
        return {"success": result.returncode == 0, 
                "output": result.stdout[:2000], 
                "error": result.stderr[:500] if result.stderr else None}
    except Exception as e:
        return {"success": False, "error": str(e)}


@mcp.tool()
def check_weather(city: str = "北京") -> dict:
    """查询天气。用于获取城市天气信息。"""
    try:
        result = subprocess.run(
            f"curl -s 'wttr.in/{city}?format=j1' 2>/dev/null | head -100",
            shell=True, capture_output=True, text=True, timeout=10
        )
        if result.stdout:
            data = json.loads(result.stdout)
            if 'current_condition' in data:
                cc = data['current_condition'][0]
                return {
                    "success": True,
                    "city": city,
                    "temp": cc.get('temp_C', 'N/A'),
                    "condition": cc.get('weatherDesc', [{}])[0].get('value', 'N/A'),
                    "humidity": cc.get('humidity', 'N/A')
                }
        return {"success": False, "error": f"无法获取 {city} 的天气"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@mcp.tool()
def search_web(query: str) -> dict:
    """搜索网页。用于搜索信息。"""
    try:
        result = subprocess.run(
            f"curl -s 'https://ddg-api.vercel.app/search?q={query}&limit=5' 2>/dev/null",
            shell=True, capture_output=True, text=True, timeout=15
        )
        if result.stdout:
            data = json.loads(result.stdout)
            results = []
            for item in data.get('results', [])[:3]:
                results.append({
                    "title": item.get('title', ''),
                    "url": item.get('url', ''),
                    "snippet": item.get('snippet', '')[:100]
                })
            return {"success": True, "results": results}
        return {"success": False, "error": "搜索失败"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@mcp.tool()
def open_music_player() -> dict:
    """打开LX Music音乐播放器。"""
    try:
        subprocess.Popen(
            ["open", "-a", "lx-music-desktop"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        return {"success": True, "message": "已打开LX Music音乐播放器"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@mcp.tool()
def music_play_pause() -> dict:
    """播放/暂停LX Music（激活窗口后按空格键）。"""
    try:
        script = '''tell application "lx-music-desktop"
            activate
        end tell
        delay 0.3
        tell application "System Events"
            tell process "lx-music-desktop"
                keystroke " "
            end tell
        end tell'''
        subprocess.run(["osascript", "-e", script], timeout=10)
        return {"success": True, "message": "已执行播放/暂停"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@mcp.tool()
def music_next() -> dict:
    """切换到LX Music下一首（Ctrl+右方向键）。"""
    try:
        script = '''tell application "lx-music-desktop"
            activate
        end tell
        delay 0.3
        tell application "System Events"
            tell process "lx-music-desktop"
                key code 124 using control down
            end tell
        end tell'''
        subprocess.run(["osascript", "-e", script], timeout=10)
        return {"success": True, "message": "已切换到下一首"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@mcp.tool()
def music_prev() -> dict:
    """切换到LX Music上一首（Ctrl+左方向键）。"""
    try:
        script = '''tell application "lx-music-desktop"
            activate
        end tell
        delay 0.3
        tell application "System Events"
            tell process "lx-music-desktop"
                key code 123 using control down
            end tell
        end tell'''
        subprocess.run(["osascript", "-e", script], timeout=10)
        return {"success": True, "message": "已切换到上一首"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@mcp.tool()
def music_search(keyword: str) -> dict:
    """搜索LX Music音乐（ Cmd+F 打开搜索框）。"""
    try:
        # 打开播放器并聚焦
        script = '''tell application "lx-music-desktop"
            activate
        end tell
        delay 0.5
        tell application "System Events"
            tell process "lx-music-desktop"
                -- Cmd+F 打开搜索
                keystroke "f" using command down
                delay 0.5
                -- 输入搜索词
                keystroke "''' + keyword + '''"
                delay 0.3
                -- 回车搜索
                keystroke return
            end tell
        end tell'''
        subprocess.run(["osascript", "-e", script], timeout=15)
        return {"success": True, "message": f"已搜索: {keyword}，请手动选择播放"}
    except Exception as e:
        return {"success": False, "error": str(e)}




@mcp.tool()
def control_robot_arm(instruction: str) -> dict:
    """控制机械臂执行各类动作。当用户提到“机械臂”、“回到home”、“回原点”、“复位”、“指向”、“抓取”、“操作”等任何与机械臂、手臂相关的指令时，必须调用此工具。如果用户让复位/回原点/回到home，请传入 instruction="回原点"。"""
    try:
        workspace = os.path.expanduser("~/.openclaw/workspace")
        robot_dir = os.path.join(workspace, "robot_vlm")
        
        script = f"""
import sys
import os
sys.path.append('{robot_dir}')
from executor import execute_plan


if "{instruction}" in ["回原点", "复位", "回到home", "回到原点", "home"]:
    plan = {{
        "functions": [
            {{"name": "back_zero", "args": {{}}}}
        ],
        "response": "收到，正在让机械臂回原点。"
    }}
else:
    plan = {{
        "functions": [
            {{"name": "back_zero", "args": {{}}}},
            {{"name": "vlm_move", "args": {{"prompt_text": "{instruction}"}}}}
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
        return {"success": True, "output": result.stdout, "message": f"机械臂已执行: {instruction}"}
    except Exception as e:
        return {"success": False, "error": str(e)}

@mcp.tool()
def robot_arm_home() -> dict:
    """控制机械臂复位。用于让机械臂回到原点或Home姿态。"""
    try:
        import os
        import subprocess
        workspace = os.path.expanduser("~/.openclaw/workspace")
        robot_dir = os.path.join(workspace, "robot_vlm")
        
        script = f"""
import sys
import os
sys.path.append('{robot_dir}')
from executor import execute_plan

plan = {{
    "functions": [
        {{"name": "back_zero", "args": {{}}}}
    ],
    "response": "收到，正在让机械臂回原点。"
}}
execute_plan(plan)
"""
        python_exe = os.path.join(robot_dir, ".venv", "bin", "python3")
        temp_script = os.path.join(robot_dir, "temp_run.py")
        with open(temp_script, "w") as f:
            f.write(script)
            
        result = subprocess.run([python_exe, temp_script], capture_output=True, text=True)
        return {"success": True, "output": result.stdout, "message": "机械臂已成功回到Home位置"}
    except Exception as e:
        return {"success": False, "error": str(e)}


if __name__ == "__main__":
    import logging
    logging.basicConfig(level=logging.INFO)
    mcp.run(transport="stdio")