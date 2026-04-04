#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
import subprocess
from datetime import datetime

WORKSPACE = "/Users/mac/.openclaw/workspace"
SKILL_DIR = "/Users/mac/.agents/skills/all-auto-douyin-video"
HOT_API_SCRIPT = os.path.join(SKILL_DIR, "scripts", "fetch_douyin_hot_api.py")
DEFAULT_BGM = "/Users/mac/Downloads/penguinmusic-space-chillout-14194.mp3"


def get_hot_top1():
    output = subprocess.check_output(["python3", HOT_API_SCRIPT], text=True)
    data = json.loads(output)
    if not data.get("ok"):
        raise RuntimeError(f"Failed to fetch hot top1: {data}")
    return data["top1"], data


def build_title(topic: str) -> str:
    return f"热榜第1：{topic}"


def build_scene(topic: str) -> str:
    return (
        "一个适合抖音竖屏传播的高质感短视频世界，真实电影感，强情绪转场，"
        "画面干净，细节丰富，光影戏剧化，适合做热点改编，9:16 竖屏，不出现 logo，不出现杂乱文字。"
    )


def build_shots(topic: str):
    return [
        f"1. 以“{topic}”为灵感的开场镜头，情绪一下抓住人，画面有强烈视觉记忆点和戏剧化转场感。",
        f"2. 近景强化热点核心元素，镜头快速推进，突出“{topic}”带来的氛围和讨论感。",
        f"3. 中景展示更完整的场面关系，画面层次拉开，形成抖音式的节奏推进。",
        f"4. 一个高光转场镜头，视觉风格达到顶点，让“{topic}”的感觉彻底立住。",
        f"5. 收尾镜头留有余味，画面平稳落下，但情绪和记忆点还在。",
    ]


def build_narration(topic: str) -> str:
    return (
        f"今天抖音热榜第一，是{topic}。"
        "一个热点能冲上第一，靠的从来不只是信息本身。"
        "真正让人停下来的，是那个瞬间给人的感觉。"
        f"如果把{topic}拍成一条短视频，重点不是把事情重复一遍，"
        "而是把那种一下抓住人的情绪，放大出来。"
        "好的短视频，不只是告诉你发生了什么。"
        "它会让你在几秒钟里，真的感受到它为什么能火。"
    )


def render_script(topic: str, title: str, scene: str, shots, narration: str, bgm_path: str) -> str:
    return (
        f"标题：\n{title}\n\n"
        f"固定场景/角色：\n{scene}\n\n"
        f"镜头描述：\n" + "\n".join(shots) + "\n\n"
        f"旁白文案：\n{narration}\n\n"
        f"背景音乐：\n{bgm_path}\n"
    )


def main():
    topic, raw = get_hot_top1()
    title = build_title(topic)
    scene = build_scene(topic)
    shots = build_shots(topic)
    narration = build_narration(topic)
    script = render_script(topic, title, scene, shots, narration, DEFAULT_BGM)

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = os.path.join(WORKSPACE, f"douyin_hot_script_{ts}.txt")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(script)

    print(json.dumps({
        "ok": True,
        "topic": topic,
        "title": title,
        "script_path": out_path,
        "source_raw": raw,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
