#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
import re
import subprocess
import sys
from datetime import datetime

SKILL_DIR = "/Users/mac/.agents/skills/all-auto-douyin-video"
WORKSPACE = "/Users/mac/.openclaw/workspace"
VENV_PY = os.path.join(SKILL_DIR, "venv", "bin", "python")
GEN_SCRIPT = os.path.join(SKILL_DIR, "scripts", "generate_hot_script.py")
RUN_SCRIPT = os.path.join(SKILL_DIR, "run.py")


def parse_final_video_path(text: str):
    m = re.search(r"Final video saved to:\s*(.+)", text)
    return m.group(1).strip() if m else None


def write_log_file(prefix: str, payload: dict):
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(WORKSPACE, f"{prefix}_{ts}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return path


def main():
    gen_proc = subprocess.run(
        ["python3", GEN_SCRIPT],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    gen_data = json.loads(gen_proc.stdout)
    script_path = gen_data["script_path"]

    run_proc = subprocess.run(
        [VENV_PY, RUN_SCRIPT, script_path],
        cwd=SKILL_DIR,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    final_video = parse_final_video_path(run_proc.stdout)

    success_payload = {
        "ok": True,
        "topic": gen_data.get("topic"),
        "title": gen_data.get("title"),
        "script_path": script_path,
        "final_video_path": final_video,
        "raw_output_tail": run_proc.stdout[-3000:],
    }
    log_path = write_log_file("douyin_hot_pipeline_success", success_payload)
    success_payload["log_path"] = log_path
    print(json.dumps(success_payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as e:
        error_payload = {
            "ok": False,
            "returncode": e.returncode,
            "stdout": e.stdout[-5000:] if e.stdout else "",
            "stderr": e.stderr[-5000:] if e.stderr else "",
        }
        log_path = write_log_file("douyin_hot_pipeline_error", error_payload)
        error_payload["log_path"] = log_path
        print(json.dumps(error_payload, ensure_ascii=False, indent=2))
        sys.exit(1)
