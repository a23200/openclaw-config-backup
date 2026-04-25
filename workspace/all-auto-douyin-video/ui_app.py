import asyncio
import json
import os
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, BackgroundTasks, Form
from fastapi.responses import HTMLResponse, JSONResponse

BASE_DIR = Path(__file__).resolve().parent
RUNS_DIR = BASE_DIR / "runs"
RUNS_DIR.mkdir(exist_ok=True)

app = FastAPI(title="即梦自动化工作流 UI")

HTML = """
<!doctype html>
<html lang=\"zh-CN\">
<head>
  <meta charset=\"UTF-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />
  <title>即梦自动化工作流</title>
  <style>
    body { font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif; max-width: 980px; margin: 32px auto; padding: 0 16px; color: #111; }
    h1 { margin-bottom: 8px; }
    .muted { color:#666; margin-bottom: 20px; }
    form, .card { border:1px solid #e5e5e5; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
    textarea, input { width:100%; box-sizing:border-box; padding:10px; margin-top:6px; margin-bottom:12px; border:1px solid #ccc; border-radius:8px; }
    button { background:#111; color:#fff; border:0; border-radius:8px; padding:10px 16px; cursor:pointer; }
    table { width:100%; border-collapse: collapse; }
    th, td { text-align:left; border-bottom:1px solid #eee; padding:10px 6px; font-size:14px; }
    .ok { color:#0a7f2e; font-weight:600; }
    .warn { color:#b26a00; font-weight:600; }
    .err { color:#b00020; font-weight:600; }
  </style>
</head>
<body>
  <h1>即梦自动化工作流</h1>
  <div class=\"muted\">提交任务后立即进入后台排队，完成后可继续接导出/抖音发布链路。</div>

  <form id=\"job-form\">
    <label>任务标题</label>
    <input name=\"title\" placeholder=\"比如：公路片 / 隧道驶向晨光\" required />

    <label>固定场景 / 角色</label>
    <textarea name=\"base_prompt\" rows=\"4\" placeholder=\"输入固定场景、人物、风格\" required></textarea>

    <label>镜头描述（每行一个）</label>
    <textarea name=\"variations\" rows=\"6\" placeholder=\"镜头1...\n镜头2...\n镜头3...\" required></textarea>

    <label>旁白文案</label>
    <textarea name=\"narration\" rows=\"4\" placeholder=\"输入旁白\"></textarea>

    <label>BGM 路径</label>
    <input name=\"bgm_path\" placeholder=\"/Users/mac/Downloads/xxx.mp3\" />

    <button type=\"submit\">提交任务</button>
  </form>

  <div class=\"card\">
    <h3>任务列表</h3>
    <table>
      <thead><tr><th>任务ID</th><th>标题</th><th>状态</th><th>更新时间</th><th>结果</th></tr></thead>
      <tbody id=\"rows\"></tbody>
    </table>
  </div>

  <script>
    async function loadJobs() {
      const res = await fetch('/api/jobs');
      const jobs = await res.json();
      const rows = document.getElementById('rows');
      rows.innerHTML = jobs.map(job => `
        <tr>
          <td>${job.id}</td>
          <td>${job.title}</td>
          <td class=\"${job.status.includes('failed') ? 'err' : (job.status.includes('queued') || job.status.includes('generating') ? 'warn' : 'ok')}\">${job.status}</td>
          <td>${new Date(job.updated_at * 1000).toLocaleString()}</td>
          <td>${job.output || ''}</td>
        </tr>
      `).join('');
    }

    document.getElementById('job-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = new FormData(e.target);
      const res = await fetch('/api/jobs', { method:'POST', body: form });
      if (!res.ok) { alert('提交失败'); return; }
      e.target.reset();
      await loadJobs();
    });

    loadJobs();
    setInterval(loadJobs, 5000);
  </script>
</body>
</html>
"""


def job_dir(job_id: str) -> Path:
    return RUNS_DIR / job_id


def status_file(job_id: str) -> Path:
    return job_dir(job_id) / "status.json"


def read_status(job_id: str) -> dict[str, Any]:
    path = status_file(job_id)
    if not path.exists():
        raise FileNotFoundError(job_id)
    return json.loads(path.read_text(encoding="utf-8"))


def write_status(job_id: str, payload: dict[str, Any]) -> None:
    folder = job_dir(job_id)
    folder.mkdir(parents=True, exist_ok=True)
    payload["updated_at"] = time.time()
    status_file(job_id).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


async def simulate_jimeng_pipeline(job_id: str) -> None:
    status = read_status(job_id)
    try:
        status["status"] = "video_queued"
        write_status(job_id, status)
        await asyncio.sleep(5)

        status["status"] = "video_generating"
        write_status(job_id, status)
        await asyncio.sleep(10)

        output_path = str(job_dir(job_id) / "final.mp4")
        Path(output_path).write_bytes(b"")
        status["status"] = "video_ready"
        status["output"] = output_path
        write_status(job_id, status)
    except Exception as exc:
        status["status"] = "failed"
        status["error"] = str(exc)
        write_status(job_id, status)


@app.get("/", response_class=HTMLResponse)
def index() -> str:
    return HTML


@app.get("/api/jobs")
def list_jobs() -> JSONResponse:
    jobs = []
    for folder in sorted(RUNS_DIR.glob("*"), key=lambda p: p.stat().st_mtime, reverse=True):
        path = folder / "status.json"
        if path.exists():
            jobs.append(json.loads(path.read_text(encoding="utf-8")))
    return JSONResponse(jobs)


@app.post("/api/jobs")
def create_job(
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    base_prompt: str = Form(...),
    variations: str = Form(...),
    narration: str = Form(""),
    bgm_path: str = Form(""),
) -> JSONResponse:
    job_id = time.strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]
    payload = {
        "id": job_id,
        "title": title,
        "status": "submitted",
        "output": "",
        "error": "",
        "created_at": time.time(),
        "updated_at": time.time(),
        "input": {
            "base_prompt": base_prompt,
            "variations": [line.strip() for line in variations.splitlines() if line.strip()],
            "narration": narration,
            "bgm_path": bgm_path,
        },
    }
    write_status(job_id, payload)
    background_tasks.add_task(simulate_jimeng_pipeline, job_id)
    return JSONResponse(payload)
