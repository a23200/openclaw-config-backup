import asyncio
import json
import os
import re
import shutil
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import BackgroundTasks, FastAPI, Form
from fastapi.responses import HTMLResponse, JSONResponse

BASE_DIR = Path('/Users/mac/.openclaw/workspace')
RUNS_DIR = BASE_DIR / 'jimeng_runs'
RUNS_DIR.mkdir(exist_ok=True)

app = FastAPI(title='即梦工作流 UI')

HTML = """
<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"><title>即梦工作流</title><style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:1100px;margin:32px auto;padding:0 16px;color:#111}.muted{color:#666}form,.card{border:1px solid #e5e5e5;border-radius:12px;padding:16px;margin-bottom:16px}textarea,input,select{width:100%;box-sizing:border-box;padding:10px;margin-top:6px;margin-bottom:12px;border:1px solid #ccc;border-radius:8px}button{background:#111;color:#fff;border:0;border-radius:8px;padding:10px 16px;cursor:pointer}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #eee;padding:10px 6px;font-size:14px}.ok{color:#0a7f2e;font-weight:600}.warn{color:#b26a00;font-weight:600}.err{color:#b00020;font-weight:600}</style></head><body><h1>即梦异步工作流</h1><div class=\"muted\">新增后处理策略层：自动判断 / 纯画面 / 点题字幕 / 解说模式。</div><form id=\"job-form\"><label>任务标题</label><input name=\"title\" required><label>首帧提示词</label><textarea name=\"first_prompt\" rows=\"4\" required></textarea><label>尾帧提示词</label><textarea name=\"last_prompt\" rows=\"4\" required></textarea><label>视频提示词</label><textarea name=\"video_prompt\" rows=\"4\" required></textarea><label>视频模式</label><select name=\"video_mode\"><option value=\"frames2video\">标准模式（首尾帧）</option><option value=\"multimodal2video\">高级模式（即梦 + 音频参考）</option></select><label>参考音频路径（高级模式可选）</label><input name=\"audio_reference\" placeholder=\"/Users/mac/Downloads/ref.mp3\"><label>后处理策略</label><select name=\"post_mode\"><option value=\"auto\">自动判断</option><option value=\"visual_only\">纯画面模式</option><option value=\"title_card\">点题字幕模式</option><option value=\"narrated\">解说模式</option></select><label>点题短句（点题字幕模式可填）</label><input name=\"title_card_text\" placeholder=\"比如：穿过黑暗，前面就是早晨\"><label>抖音标题</label><input name=\"publish_title\" placeholder=\"不填则默认用任务标题\"><label>抖音描述</label><textarea name=\"publish_description\" rows=\"3\" placeholder=\"不填则自动用任务标题生成简版描述\"></textarea><label><input type=\"checkbox\" name=\"auto_publish\" value=\"1\"> 视频完成后自动发抖音</label><br><br><button type=\"submit\">提交即梦任务</button></form><div class=\"card\"><h3>任务列表</h3><table><thead><tr><th>任务ID</th><th>标题</th><th>状态</th><th>更新时间</th><th>产物</th><th>错误</th></tr></thead><tbody id=\"rows\"></tbody></table></div><script>async function loadJobs(){const res=await fetch('/api/jobs');const jobs=await res.json();document.getElementById('rows').innerHTML=jobs.map(job=>`<tr><td>${job.id}</td><td>${job.title}</td><td class=\"${job.status.includes('failed')?'err':(job.status.includes('queued')||job.status.includes('generating')||job.status.includes('submitted')||job.status.includes('publishing')||job.status.includes('post_processing')?'warn':'ok')}\">${job.status}</td><td>${new Date(job.updated_at*1000).toLocaleString()}</td><td>${job.output||''}</td><td>${job.error||''}</td></tr>`).join('')}document.getElementById('job-form').addEventListener('submit',async(e)=>{e.preventDefault();const form=new FormData(e.target);const res=await fetch('/api/jobs',{method:'POST',body:form});if(!res.ok){alert('提交失败');return;}e.target.reset();await loadJobs();});loadJobs();setInterval(loadJobs,5000);</script></body></html>
"""


def job_dir(job_id: str) -> Path:
    return RUNS_DIR / job_id


def status_path(job_id: str) -> Path:
    return job_dir(job_id) / 'status.json'


def write_status(job_id: str, data: dict[str, Any]) -> None:
    folder = job_dir(job_id)
    folder.mkdir(parents=True, exist_ok=True)
    data['updated_at'] = time.time()
    status_path(job_id).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


def read_status(job_id: str) -> dict[str, Any]:
    return json.loads(status_path(job_id).read_text(encoding='utf-8'))


def parse_result_json(raw: str) -> dict[str, Any] | None:
    try:
        return json.loads(raw)
    except Exception:
        pass
    last = None
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            last = json.loads(line)
        except Exception:
            continue
    return last


def extract_submit_id(parsed: dict[str, Any] | None) -> str | None:
    if not parsed:
        return None
    for key in ('submit_id', 'task_id', 'id'):
        value = parsed.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return None


def run_args(args: list[str], cwd: str | None = None, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, env=merged_env)


def write_publish_json(folder: Path, state: dict[str, Any], final_video: Path, cover_path: Path) -> Path:
    publish_title = state['publish'].get('title') or state['title']
    publish_description = state['publish'].get('description') or f"{state['title']} #即梦 #AI短片"
    payload = {
        'videoPath': str(final_video),
        'title': publish_title,
        'description': publish_description,
        'tags': ['即梦', 'AI短片', '电影感'],
        'coverPath': str(cover_path),
    }
    out = folder / 'douyin_publish.json'
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    return out


def publish_to_douyin(config_path: Path) -> subprocess.CompletedProcess[str]:
    return run_args(['node', '/Users/mac/.agents/skills/douyin-creator-tools/src/publish-douyin-video.mjs', str(config_path)])


def make_narration_text(title: str) -> str:
    return f"{title}。穿过黑暗，前面就是早晨。只要你还在往前开，希望就还在路上。"


def decide_post_mode(state: dict[str, Any]) -> str:
    configured = state.get('post', {}).get('mode', 'auto')
    if configured != 'auto':
        return configured
    text = ' '.join([
        state['title'],
        state['input'].get('first_prompt', ''),
        state['input'].get('last_prompt', ''),
        state['input'].get('video_prompt', ''),
    ])
    if any(token in text for token in ['讲述', '解说', '观点', '口播', '台词', '旁白']):
        return 'narrated'
    if any(token in text for token in ['氛围', '空镜', '电影感', '主观视角', '晨光', '情绪']):
        return 'title_card'
    return 'visual_only'


def write_title_card_srt(text: str, total_duration: float, output_path: Path) -> None:
    start = max(total_duration * 0.12, 0.8)
    end = min(total_duration * 0.72, total_duration - 0.8)
    output_path.write_text(f"1\n{format_srt_time(start)} --> {format_srt_time(end)}\n{text}\n", encoding='utf-8')


def generate_tts_audio(text: str, output_path: Path) -> subprocess.CompletedProcess[str]:
    return run_args(['python3', '/Users/mac/.openclaw/workspace/all-auto-douyin-video/scripts/src/generate_audio.py', text, str(output_path)])


def ffprobe_duration(path: Path) -> float:
    res = run_args(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', str(path)])
    if res.returncode != 0:
        raise RuntimeError(res.stderr or res.stdout)
    return float((res.stdout or '0').strip())


def format_srt_time(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    hours = ms // 3600000
    ms %= 3600000
    minutes = ms // 60000
    ms %= 60000
    secs = ms // 1000
    ms %= 1000
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{ms:03d}"


def write_simple_srt(text: str, total_duration: float, output_path: Path) -> None:
    sentences = [part.strip() for part in re.split(r'[。！？!?]+', text) if part.strip()]
    if not sentences:
        sentences = [text.strip()]
    chunk = max(total_duration / max(len(sentences), 1), 1.0)
    lines = []
    current = 0.0
    for idx, sentence in enumerate(sentences, start=1):
        end = total_duration if idx == len(sentences) else min(total_duration, current + chunk)
        lines.append(f"{idx}\n{format_srt_time(current)} --> {format_srt_time(end)}\n{sentence}\n")
        current = end
    output_path.write_text("\n".join(lines), encoding='utf-8')


def transcribe_with_whisper(audio_path: Path, out_dir: Path) -> subprocess.CompletedProcess[str]:
    return run_args(['whisper', str(audio_path), '--model', 'base', '--language', 'zh', '--task', 'transcribe', '--output_format', 'srt', '--output_dir', str(out_dir)], env={'KMP_DUPLICATE_LIB_OK': 'TRUE'})


def srt_to_ass(srt_path: Path, ass_path: Path) -> None:
    content = srt_path.read_text(encoding='utf-8').strip()
    blocks = re.split(r'\n\s*\n', content)
    header = """[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,PingFang SC,72,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,3,0,2,80,80,180,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"""
    lines = [header]
    for block in blocks:
        parts = [line.strip() for line in block.splitlines() if line.strip()]
        if len(parts) < 3:
            continue
        timing = parts[1]
        text = ' '.join(parts[2:]).replace('\n', ' ').replace(',', '，')
        start, end = [item.strip() for item in timing.split('-->')]
        start = start.replace(',', '.'); end = end.replace(',', '.')
        lines.append(f"Dialogue: 0,{start},{end},Default,,0,0,0,,{text}")
    ass_path.write_text('\n'.join(lines), encoding='utf-8')


def ffmpeg_subtitle_filter(subtitle_path: Path) -> str:
    path = str(subtitle_path).replace('\\', '/').replace(':', '\\:').replace(',', '\\,').replace('[', '\\[').replace(']', '\\]')
    return f"subtitles=filename={path}"


def burn_subtitles_only(video_path: Path, subtitle_path: Path, output_path: Path) -> subprocess.CompletedProcess[str]:
    return run_args(['ffmpeg', '-y', '-i', str(video_path), '-vf', ffmpeg_subtitle_filter(subtitle_path), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'copy', str(output_path)])


def merge_audio_video_with_subtitles(video_path: Path, audio_path: Path, subtitle_path: Path, output_path: Path) -> subprocess.CompletedProcess[str]:
    return run_args(['ffmpeg', '-y', '-i', str(video_path), '-i', str(audio_path), '-vf', ffmpeg_subtitle_filter(subtitle_path), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-shortest', str(output_path)])


def download_by_query(submit_id: str, download_dir: Path) -> subprocess.CompletedProcess[str]:
    return run_args(['dreamina', 'query_result', f'--submit_id={submit_id}', f'--download_dir={download_dir}'])


def find_latest_video(folder: Path) -> Path | None:
    videos = [p for p in folder.glob('*.mp4') if p.name not in {'final_mastered.mp4'}]
    return sorted(videos, key=lambda p: p.stat().st_mtime)[-1] if videos else None


async def process_job(job_id: str) -> None:
    state = read_status(job_id)
    folder = job_dir(job_id)
    try:
        first_path = folder / 'first_frame.png'
        last_path = folder / 'last_frame.png'

        state['status'] = 'first_frame_generating'
        write_status(job_id, state)
        first_res = run_args(['dreamina', 'text2image', f"--prompt={state['input']['first_prompt']}", '--ratio=9:16', '--resolution_type=2k', '--poll=60'])
        if first_res.returncode != 0:
            raise RuntimeError(first_res.stderr or first_res.stdout)
        (folder / 'first_frame_result.json').write_text(first_res.stdout, encoding='utf-8')
        first_submit_id = extract_submit_id(parse_result_json(first_res.stdout))
        state['first_submit_id'] = first_submit_id or ''
        write_status(job_id, state)
        if first_submit_id:
            query_res = download_by_query(first_submit_id, folder)
            if query_res.returncode != 0:
                raise RuntimeError(query_res.stderr or query_res.stdout)
        candidates = list(folder.glob('*first*')) + list(folder.glob('*.png')) + list(folder.glob('*.jpg'))
        if candidates:
            chosen = sorted(candidates, key=lambda p: p.stat().st_mtime)[-1]
            if chosen != first_path:
                shutil.copy2(chosen, first_path)
        if not first_path.exists():
            raise RuntimeError('首帧下载失败')

        state['status'] = 'last_frame_generating'
        write_status(job_id, state)
        last_res = run_args(['dreamina', 'image2image', '--images', str(first_path), f"--prompt={state['input']['last_prompt']}", '--resolution_type=2k', '--poll=60'])
        if last_res.returncode != 0:
            raise RuntimeError(last_res.stderr or last_res.stdout)
        (folder / 'last_frame_result.json').write_text(last_res.stdout, encoding='utf-8')
        last_submit_id = extract_submit_id(parse_result_json(last_res.stdout))
        state['last_submit_id'] = last_submit_id or ''
        write_status(job_id, state)
        if last_submit_id:
            query_res = download_by_query(last_submit_id, folder)
            if query_res.returncode != 0:
                raise RuntimeError(query_res.stderr or query_res.stdout)
        image_candidates = [p for p in folder.glob('*') if p.suffix.lower() in {'.png', '.jpg', '.jpeg'} and p.name != 'first_frame.png']
        if image_candidates:
            chosen = sorted(image_candidates, key=lambda p: p.stat().st_mtime)[-1]
            if chosen != last_path:
                shutil.copy2(chosen, last_path)
        if not last_path.exists():
            raise RuntimeError('尾帧下载失败')

        state['status'] = 'video_submitted'
        write_status(job_id, state)
        if state['video'].get('mode') == 'multimodal2video':
            args = ['dreamina', 'multimodal2video', '--image', str(first_path), f"--prompt={state['input']['video_prompt']}", '--model_version=seedance2.0fast', '--duration=15', '--ratio=9:16', '--video_resolution=720p', '--poll=120']
            audio_ref = state['video'].get('audio_reference', '').strip()
            if audio_ref:
                args.extend(['--audio', audio_ref])
        else:
            args = ['dreamina', 'frames2video', f'--first={first_path}', f'--last={last_path}', f"--prompt={state['input']['video_prompt']}", '--model_version=seedance2.0fast', '--duration=15', '--video_resolution=720p', '--poll=120']
        video_res = run_args(args)
        if video_res.returncode != 0:
            raise RuntimeError(video_res.stderr or video_res.stdout)
        (folder / 'video_result.json').write_text(video_res.stdout, encoding='utf-8')
        video_submit_id = extract_submit_id(parse_result_json(video_res.stdout))
        state['video_submit_id'] = video_submit_id or ''
        state['status'] = 'video_queued'
        write_status(job_id, state)
        if not video_submit_id:
            latest = find_latest_video(folder)
            if latest:
                final_path = folder / 'final.mp4'
                if latest != final_path:
                    shutil.copy2(latest, final_path)
            else:
                raise RuntimeError('未拿到视频 submit_id')
        else:
            while True:
                state['status'] = 'video_querying'
                write_status(job_id, state)
                query_res = download_by_query(video_submit_id, folder)
                (folder / 'video_query.log').write_text((query_res.stdout or '') + '\n' + (query_res.stderr or ''), encoding='utf-8')
                latest = find_latest_video(folder)
                if latest and latest.name != 'final.mp4':
                    shutil.copy2(latest, folder / 'final.mp4')
                if (folder / 'final.mp4').exists():
                    break
                await asyncio.sleep(120)

        final_path = folder / 'final.mp4'
        if not final_path.exists():
            latest = find_latest_video(folder)
            if latest:
                shutil.copy2(latest, final_path)
        if not final_path.exists():
            raise RuntimeError('视频下载失败')

        state['status'] = 'video_ready'
        state['output'] = str(final_path)
        write_status(job_id, state)

        state['status'] = 'post_processing'
        write_status(job_id, state)
        duration = ffprobe_duration(final_path)
        mastered_path = folder / 'final_mastered.mp4'
        srt_path = folder / 'subtitles.srt'
        ass_path = folder / 'subtitles.ass'
        chosen_post_mode = decide_post_mode(state)
        state['post']['resolved_mode'] = chosen_post_mode
        write_status(job_id, state)

        if chosen_post_mode == 'visual_only':
            shutil.copy2(final_path, mastered_path)
        elif chosen_post_mode == 'narrated':
            narration_text = make_narration_text(state['title'])
            narration_path = folder / 'narration.mp3'
            tts_res = generate_tts_audio(narration_text, narration_path)
            if tts_res.returncode != 0 or not narration_path.exists():
                raise RuntimeError('旁白生成失败: ' + ((tts_res.stderr or tts_res.stdout).strip() or 'unknown'))
            whisper_res = transcribe_with_whisper(narration_path, folder)
            generated_srt = folder / f'{narration_path.stem}.srt'
            if whisper_res.returncode == 0 and generated_srt.exists():
                shutil.copy2(generated_srt, srt_path)
            else:
                write_simple_srt(narration_text, duration, srt_path)
            srt_to_ass(srt_path, ass_path)
            merge_res = merge_audio_video_with_subtitles(final_path, narration_path, ass_path, mastered_path)
            if merge_res.returncode != 0 or not mastered_path.exists():
                raise RuntimeError('字幕/混音失败: ' + ((merge_res.stderr or merge_res.stdout).strip() or 'unknown'))
        else:
            if chosen_post_mode == 'title_card':
                title_text = state.get('post', {}).get('title_card_text') or '穿过黑暗，前面就是早晨'
                write_title_card_srt(title_text, duration, srt_path)
            else:
                write_simple_srt(state['title'], duration, srt_path)
            srt_to_ass(srt_path, ass_path)
            burn_res = burn_subtitles_only(final_path, ass_path, mastered_path)
            if burn_res.returncode != 0 or not mastered_path.exists():
                fallback_output = folder / 'final_with_external_subtitles.mp4'
                shutil.copy2(final_path, fallback_output)
                state['subtitle_mode'] = 'external_only'
                state['subtitle_error'] = (burn_res.stderr or burn_res.stdout).strip()
                mastered_path = fallback_output
            else:
                state['subtitle_mode'] = 'burned'

        state['status'] = 'mastered'
        state['output'] = str(mastered_path)
        write_status(job_id, state)

        if state.get('publish', {}).get('auto_publish'):
            state['status'] = 'publishing'
            write_status(job_id, state)
            publish_json = write_publish_json(folder, state, mastered_path, first_path)
            publish_res = publish_to_douyin(publish_json)
            (folder / 'douyin_publish.log').write_text((publish_res.stdout or '') + '\n' + (publish_res.stderr or ''), encoding='utf-8')
            if publish_res.returncode != 0:
                raise RuntimeError('抖音发布失败: ' + ((publish_res.stderr or publish_res.stdout).strip() or 'unknown'))
            state['status'] = 'published'
            state['publish_config'] = str(publish_json)
            write_status(job_id, state)
    except Exception as exc:
        state['status'] = 'failed'
        state['error'] = str(exc)
        write_status(job_id, state)


@app.get('/', response_class=HTMLResponse)
def index() -> str:
    return HTML


@app.get('/api/jobs')
def list_jobs() -> JSONResponse:
    rows = []
    for folder in sorted(RUNS_DIR.glob('*'), key=lambda p: p.stat().st_mtime, reverse=True):
        p = folder / 'status.json'
        if p.exists():
            rows.append(json.loads(p.read_text(encoding='utf-8')))
    return JSONResponse(rows)


@app.post('/api/jobs')
def create_job(background_tasks: BackgroundTasks, title: str = Form(...), first_prompt: str = Form(...), last_prompt: str = Form(...), video_prompt: str = Form(...), video_mode: str = Form('frames2video'), audio_reference: str = Form(''), post_mode: str = Form('auto'), title_card_text: str = Form(''), publish_title: str = Form(''), publish_description: str = Form(''), auto_publish: str = Form('')) -> JSONResponse:
    job_id = time.strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:6]
    state = {
        'id': job_id,
        'title': title,
        'status': 'submitted',
        'error': '',
        'output': '',
        'created_at': time.time(),
        'updated_at': time.time(),
        'input': {
            'first_prompt': first_prompt,
            'last_prompt': last_prompt,
            'video_prompt': video_prompt,
        },
        'video': {
            'mode': video_mode,
            'audio_reference': audio_reference,
        },
        'post': {
            'mode': post_mode,
            'title_card_text': title_card_text,
        },
        'publish': {
            'title': publish_title,
            'description': publish_description,
            'auto_publish': auto_publish == '1',
        }
    }
    write_status(job_id, state)
    background_tasks.add_task(process_job, job_id)
    return JSONResponse(state)
