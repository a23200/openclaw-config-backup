import asyncio
import json
import mimetypes
import os
import random
import re
import shutil
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import BackgroundTasks, FastAPI, Form, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE_DIR = Path('/Users/mac/.openclaw/workspace')
RUNS_DIR = BASE_DIR / 'jimeng_runs'
RUNS_DIR.mkdir(parents=True, exist_ok=True)

STATIC_DIR = Path(__file__).resolve().parent / 'static'

STATE_TIMELINE = [
    'submitted',
    'first_frame_generating',
    'first_frame_querying',
    'last_frame_generating',
    'last_frame_querying',
    'video_submitted',
    'video_queued',
    'video_querying',
    'video_ready',
    'post_processing',
    'mastered',
    'publishing',
    'published',
]

TERMINAL_STATES = {'published', 'mastered', 'failed'}

app = FastAPI(title='即梦工作流 UI')


class NoCacheStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):  # type: ignore[override]
        response = await super().get_response(path, scope)
        response.headers['cache-control'] = 'no-store, no-cache, must-revalidate'
        return response


app.mount('/static', NoCacheStaticFiles(directory=str(STATIC_DIR)), name='static')


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


import socket
import urllib.request
import urllib.error
from . import douyin_cdp_publisher

CHROME_APP_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
CHROME_DEBUG_PORT = 9222
CHROME_DEBUG_HOST = '127.0.0.1'
CHROME_USER_DATA_DIR = str(Path.home() / 'Library' / 'Application Support' / 'Jimeng-Publish-Chrome')
CHROME_CDP_ENDPOINT = f'http://{CHROME_DEBUG_HOST}:{CHROME_DEBUG_PORT}'


def _port_open(host: str, port: int, timeout: float = 0.3) -> bool:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(timeout)
    try:
        s.connect((host, port))
        return True
    except OSError:
        return False
    finally:
        try:
            s.close()
        except Exception:
            pass


def _cdp_version_info(timeout: float = 1.0) -> dict[str, Any] | None:
    """GET /json/version on the CDP port — confirms the port is real CDP, not a
    stray listener, and returns the Chrome version + webSocketDebuggerUrl."""
    try:
        with urllib.request.urlopen(f'{CHROME_CDP_ENDPOINT}/json/version', timeout=timeout) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        return None


def _chrome_process_running() -> bool:
    try:
        res = subprocess.run(
            ['pgrep', '-f', f'--user-data-dir={CHROME_USER_DATA_DIR}'],
            capture_output=True, text=True, timeout=2,
        )
        return bool(res.stdout.strip())
    except Exception:
        return False


def _launch_debug_chrome() -> dict[str, Any]:
    """Launch the long-lived debug Chrome if it's not already running.

    Uses a fixed user-data-dir (~/.jimeng-publish-chrome) so the user logs into
    Douyin once and the cookies persist across restarts. Chrome 136+ accepts
    --remote-debugging-port ONLY on non-default profiles, which is why we use
    a dedicated user-data-dir here.
    """
    Path(CHROME_USER_DATA_DIR).mkdir(parents=True, exist_ok=True)
    if _port_open(CHROME_DEBUG_HOST, CHROME_DEBUG_PORT) and _cdp_version_info():
        return {'ok': True, 'already_running': True, 'endpoint': CHROME_CDP_ENDPOINT}
    if not Path(CHROME_APP_PATH).exists():
        return {'ok': False, 'error': f'找不到 Chrome: {CHROME_APP_PATH}'}
    args = [
        CHROME_APP_PATH,
        f'--remote-debugging-port={CHROME_DEBUG_PORT}',
        f'--user-data-dir={CHROME_USER_DATA_DIR}',
        '--no-first-run',
        '--no-default-browser-check',
        'https://creator.douyin.com',
    ]
    subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    deadline = time.time() + 15
    while time.time() < deadline:
        if _port_open(CHROME_DEBUG_HOST, CHROME_DEBUG_PORT) and _cdp_version_info():
            return {'ok': True, 'already_running': False, 'endpoint': CHROME_CDP_ENDPOINT}
        time.sleep(0.3)
    return {'ok': False, 'error': f'Chrome 启动后 15s 内 {CHROME_DEBUG_HOST}:{CHROME_DEBUG_PORT} 仍未就绪'}


class PublishConfig(BaseModel):
    videoPath: str
    title: str
    description: str
    tags: list[str] = Field(default_factory=lambda: ['即梦', 'AI短片', '电影感'])
    coverPath: str


def pick_cover_path(folder: Path, choice: str = 'auto') -> Path | None:
    first = folder / 'first_frame.png'
    last = folder / 'last_frame.png'
    if choice == 'first' and first.exists():
        return first
    if choice == 'last' and last.exists():
        return last
    for p in (last, first):
        if p.exists():
            return p
    pngs = sorted([p for p in folder.glob('*.png') if p.is_file()], key=lambda p: p.stat().st_mtime, reverse=True)
    return pngs[0] if pngs else None


def pick_final_video(folder: Path) -> Path | None:
    for name in ('final_mastered.mp4', 'final_with_external_subtitles.mp4', 'final.mp4'):
        p = folder / name
        if p.exists():
            return p
    return None


def build_publish_config(folder: Path, state: dict[str, Any], cover_choice: str = 'auto') -> tuple[PublishConfig, Path] | None:
    video = pick_final_video(folder)
    if video is None:
        return None
    cover = pick_cover_path(folder, cover_choice)
    if cover is None:
        return None
    title = state['publish'].get('title') or state['title']
    description = state['publish'].get('description') or f"{state['title']} #即梦 #AI短片"
    cfg = PublishConfig(videoPath=str(video), title=title, description=description, coverPath=str(cover))
    out = folder / 'douyin_publish.json'
    out.write_text(cfg.model_dump_json(indent=2), encoding='utf-8')
    return cfg, out


def publish_preflight() -> dict[str, Any]:
    """CDP readiness check.

    We attach to a long-lived dedicated debug Chrome (fixed user-data-dir at
    ~/.jimeng-publish-chrome, launched with --remote-debugging-port=9222). The
    user logs into Douyin once in that window; cookies persist forever.
    """
    port_up = _port_open(CHROME_DEBUG_HOST, CHROME_DEBUG_PORT)
    ver = _cdp_version_info() if port_up else None
    proc_up = _chrome_process_running()
    ready = port_up and ver is not None
    return {
        'ready': ready,
        'backend': 'cdp',
        'cdp_endpoint': CHROME_CDP_ENDPOINT,
        'debug_port': CHROME_DEBUG_PORT,
        'port_open': port_up,
        'cdp_ok': ver is not None,
        'chrome_version': (ver or {}).get('Browser', ''),
        'process_running': proc_up,
        'user_data_dir': CHROME_USER_DATA_DIR,
    }


def publish_to_douyin(folder: Path, config_path: Path) -> dict[str, Any]:
    """Publish via CDP. Persists result JSON next to the log."""
    result_path = folder / 'douyin_publish_result.json'
    result = douyin_cdp_publisher.publish_via_cdp(folder, config_path, endpoint=CHROME_CDP_ENDPOINT)
    try:
        result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    except Exception:
        pass
    return result


def browser_connectivity_test() -> dict[str, Any]:
    """Attach via CDP, verify reachability AND Douyin login state.

    Behavior:
    - If a creator.douyin.com tab is already open, reuse it (no new tab).
    - Otherwise open a temporary tab, read login state, then close it so we
      don't leave stray about:blank tabs lying around.
    """
    started = time.time()
    out: dict[str, Any] = {'ok': False, 'error': '', 'elapsed_sec': None, 'logged_in': False}
    try:
        from playwright.sync_api import sync_playwright
        out['pages_before'] = douyin_cdp_publisher._ensure_page_target(
            CHROME_CDP_ENDPOINT, fallback_url='https://creator.douyin.com'
        )
        with sync_playwright() as pw:
            browser = pw.chromium.connect_over_cdp(CHROME_CDP_ENDPOINT, timeout=5000)
            try:
                ctx = browser.contexts[0] if browser.contexts else browser.new_context()
                existing = next((p for p in ctx.pages if 'creator.douyin.com' in p.url), None)
                page = existing
                created_temp = False
                if page is None:
                    page = ctx.new_page()
                    created_temp = True
                    page.goto('https://creator.douyin.com/creator-micro/home', wait_until='domcontentloaded', timeout=15000)
                cookies = ctx.cookies('https://creator.douyin.com')
                has_session = any(c.get('name') == 'sessionid' for c in cookies)
                url_now = page.url or ''
                on_login = '/login' in url_now or 'passport' in url_now
                out['logged_in'] = bool(has_session and not on_login)
                out['url'] = url_now
                out['cookie_count'] = len(cookies)
                out['ok'] = True
                if created_temp:
                    try:
                        page.close()
                    except Exception:
                        pass
                out['pages_after'] = len(ctx.pages)
            finally:
                try:
                    browser.close()
                except Exception:
                    pass
    except Exception as exc:
        out['error'] = f'{type(exc).__name__}: {exc}'
    out['elapsed_sec'] = round(time.time() - started, 2)
    return out


def launch_debug_chrome_api() -> dict[str, Any]:
    return _launch_debug_chrome()


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
            state['status'] = 'first_frame_querying'
            write_status(job_id, state)
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
            state['status'] = 'last_frame_querying'
            write_status(job_id, state)
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
            cover_choice = state.get('publish', {}).get('cover') or 'auto'
            built = build_publish_config(folder, state, cover_choice)
            if not built:
                raise RuntimeError('构建发布配置失败：找不到最终视频或封面图')
            _, publish_json = built
            state['publish_config'] = str(publish_json)
            write_status(job_id, state)
            # Sync Playwright can't run inside an asyncio event loop, so off-load
            # the publish call to a worker thread.
            result = await asyncio.to_thread(publish_to_douyin, folder, publish_json)
            state['publish_result'] = result
            if result['status'] != 'ok':
                raise RuntimeError('抖音发布失败: ' + (result.get('error') or 'unknown'))
            state['status'] = 'published'
            write_status(job_id, state)
    except Exception as exc:
        state['status'] = 'failed'
        state['error'] = str(exc)
        write_status(job_id, state)


def list_artifacts(folder: Path) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    if not folder.exists():
        return items
    for p in sorted(folder.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
        if p.is_dir():
            continue
        stat = p.stat()
        items.append({
            'name': p.name,
            'size': stat.st_size,
            'modified': stat.st_mtime,
            'suffix': p.suffix.lower(),
        })
    return items


def safe_resolve_job_file(job_id: str, name: str) -> Path:
    folder = job_dir(job_id).resolve()
    target = (folder / name).resolve()
    if folder not in target.parents and target != folder:
        raise HTTPException(status_code=400, detail='invalid path')
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail='file not found')
    return target


@app.get('/', response_class=HTMLResponse)
def index() -> HTMLResponse:
    html = (STATIC_DIR / 'index.html').read_text(encoding='utf-8')
    ver = str(int(time.time()))
    html = html.replace('/static/style.css', f'/static/style.css?v={ver}')
    html = html.replace('/static/app.js', f'/static/app.js?v={ver}')
    return HTMLResponse(html, headers={'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'})


@app.get('/api/meta')
def meta() -> JSONResponse:
    return JSONResponse({
        'timeline': STATE_TIMELINE,
        'terminal': sorted(TERMINAL_STATES),
    })


@app.get('/api/jobs')
def list_jobs() -> JSONResponse:
    rows = []
    for folder in sorted(RUNS_DIR.glob('*'), key=lambda p: p.stat().st_mtime, reverse=True):
        p = folder / 'status.json'
        if p.exists():
            rows.append(json.loads(p.read_text(encoding='utf-8')))
    return JSONResponse(rows)


@app.get('/api/jobs/{job_id}')
def get_job(job_id: str) -> JSONResponse:
    sp = status_path(job_id)
    if not sp.exists():
        raise HTTPException(status_code=404, detail='job not found')
    state = json.loads(sp.read_text(encoding='utf-8'))
    state['artifacts'] = list_artifacts(job_dir(job_id))
    return JSONResponse(state)


@app.post('/api/jobs')
def create_job(background_tasks: BackgroundTasks, title: str = Form(...), first_prompt: str = Form(...), last_prompt: str = Form(...), video_prompt: str = Form(...), video_mode: str = Form('frames2video'), audio_reference: str = Form(''), post_mode: str = Form('auto'), title_card_text: str = Form(''), publish_title: str = Form(''), publish_description: str = Form(''), publish_cover: str = Form('auto'), auto_publish: str = Form('')) -> JSONResponse:
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
            'cover': publish_cover if publish_cover in {'auto', 'first', 'last'} else 'auto',
            'auto_publish': auto_publish == '1',
        }
    }
    write_status(job_id, state)
    background_tasks.add_task(process_job, job_id)
    return JSONResponse(state)


@app.get('/api/publish/preflight')
def publish_preflight_api() -> JSONResponse:
    return JSONResponse(publish_preflight())


@app.get('/api/browser/status')
def browser_status_api() -> JSONResponse:
    return JSONResponse(publish_preflight())


@app.post('/api/browser/test')
def browser_test_api() -> JSONResponse:
    return JSONResponse(browser_connectivity_test())


@app.post('/api/browser/launch')
def browser_launch_api() -> JSONResponse:
    return JSONResponse(launch_debug_chrome_api())


def _do_manual_publish(job_id: str, cover_choice: str) -> None:
    state = read_status(job_id)
    folder = job_dir(job_id)
    try:
        state['status'] = 'publishing'
        state['error'] = ''
        if 'publish' not in state:
            state['publish'] = {}
        state['publish']['cover'] = cover_choice
        write_status(job_id, state)
        built = build_publish_config(folder, state, cover_choice)
        if not built:
            raise RuntimeError('构建发布配置失败：找不到最终视频或封面图')
        _, publish_json = built
        state['publish_config'] = str(publish_json)
        write_status(job_id, state)
        result = publish_to_douyin(folder, publish_json)
        state['publish_result'] = result
        if result['status'] != 'ok':
            state['status'] = 'failed'
            state['error'] = '抖音发布失败: ' + (result.get('error') or 'unknown')
            write_status(job_id, state)
            return
        state['status'] = 'published'
        write_status(job_id, state)
    except Exception as exc:
        state['status'] = 'failed'
        state['error'] = str(exc)
        write_status(job_id, state)


@app.post('/api/jobs/{job_id}/publish')
def publish_job(job_id: str, background_tasks: BackgroundTasks, cover: str = Form('auto')) -> JSONResponse:
    sp = status_path(job_id)
    if not sp.exists():
        raise HTTPException(status_code=404, detail='job not found')
    state = json.loads(sp.read_text(encoding='utf-8'))
    if state.get('status') not in {'mastered', 'failed', 'published'}:
        raise HTTPException(status_code=409, detail=f"当前状态 {state.get('status')} 不支持手动发布")
    pre = publish_preflight()
    if not pre['ready']:
        if not pre.get('port_open'):
            detail = f'调试 Chrome 未运行（{CHROME_CDP_ENDPOINT}）· 请先点"启动调试 Chrome"，并在打开的窗口里登录抖音创作者后台'
        elif not pre.get('cdp_ok'):
            detail = f'{CHROME_DEBUG_HOST}:{CHROME_DEBUG_PORT} 端口有监听但不是 CDP（可能被其他进程占用）'
        else:
            detail = 'CDP 未就绪（未知原因）'
        raise HTTPException(status_code=424, detail=detail)
    cover = cover if cover in {'auto', 'first', 'last'} else 'auto'
    background_tasks.add_task(_do_manual_publish, job_id, cover)
    return JSONResponse({'ok': True, 'cover': cover})


@app.post('/api/jobs/{job_id}/retry')
def retry_job(job_id: str, background_tasks: BackgroundTasks) -> JSONResponse:
    sp = status_path(job_id)
    if not sp.exists():
        raise HTTPException(status_code=404, detail='job not found')
    state = json.loads(sp.read_text(encoding='utf-8'))
    state['status'] = 'submitted'
    state['error'] = ''
    write_status(job_id, state)
    background_tasks.add_task(process_job, job_id)
    return JSONResponse(state)


@app.delete('/api/jobs/{job_id}')
def delete_job(job_id: str) -> JSONResponse:
    folder = job_dir(job_id)
    if not folder.exists():
        raise HTTPException(status_code=404, detail='job not found')
    shutil.rmtree(folder)
    return JSONResponse({'ok': True})


@app.get('/api/jobs/{job_id}/files')
def job_files(job_id: str) -> JSONResponse:
    folder = job_dir(job_id)
    if not folder.exists():
        raise HTTPException(status_code=404, detail='job not found')
    return JSONResponse(list_artifacts(folder))


@app.get('/api/jobs/{job_id}/files/{name}')
def download_file(job_id: str, name: str) -> FileResponse:
    target = safe_resolve_job_file(job_id, name)
    media, _ = mimetypes.guess_type(target.name)
    return FileResponse(str(target), media_type=media or 'application/octet-stream', filename=target.name)


@app.get('/api/jobs/{job_id}/preview/{name}')
def preview_file(job_id: str, name: str) -> FileResponse:
    target = safe_resolve_job_file(job_id, name)
    media, _ = mimetypes.guess_type(target.name)
    return FileResponse(str(target), media_type=media or 'application/octet-stream')


# ============================================================
# 抖音热榜 + AI 提示词生成
# ============================================================

HOT_CACHE: dict[str, Any] = {'ts': 0.0, 'data': []}
HOT_CACHE_TTL = 600  # 10 分钟

HOT_SOURCES = [
    ('xxapi', 'https://v2.xxapi.cn/api/douyinhot'),
    ('vvhan', 'https://api.vvhan.com/api/hotlist/douyinHot'),
    ('imsyy', 'https://api-hot.imsyy.top/douyin'),
    ('tenapi', 'https://tenapi.cn/v2/douyinhot'),
]

HOT_FALLBACK_TOPICS = [
    '普通人下班后的真实疲惫',
    '一个人开车穿过凌晨城市',
    '成年人的崩溃都很安静',
    '地铁末班车上的孤独感',
    '那些突然想通的人生瞬间',
    '年轻人为什么越来越沉默',
    '假如生活突然按下暂停键',
    '城市黎明前最安静的十分钟',
    '你有多久没认真看过日出了',
    '失眠的人都在想什么',
    '雨夜车窗外的情绪电影感',
    '春天来了但快乐还没回来',
]


def _fallback_hot_items() -> list[dict[str, Any]]:
    return [
        {
            'title': title,
            'hot': f'fallback-{idx + 1}',
            'url': '',
            'source': 'fallback',
        }
        for idx, title in enumerate(HOT_FALLBACK_TOPICS)
    ]


def _normalize_hot_items(source: str, payload: Any) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    raw = None
    if isinstance(payload, dict):
        for key in ('data', 'list', 'items', 'result'):
            value = payload.get(key)
            if isinstance(value, list):
                raw = value
                break
            if isinstance(value, dict):
                inner = value.get('list') or value.get('items') or value.get('data')
                if isinstance(inner, list):
                    raw = inner
                    break
    elif isinstance(payload, list):
        raw = payload
    if not isinstance(raw, list):
        return items
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        title = (entry.get('title') or entry.get('word') or entry.get('name') or entry.get('keyword') or entry.get('sentence') or '').strip()
        if not title:
            continue
        hot = entry.get('hot') or entry.get('hot_value') or entry.get('heat') or entry.get('score') or entry.get('num') or entry.get('position')
        url = entry.get('url') or entry.get('link') or entry.get('mobile_url') or entry.get('share_url') or ''
        items.append({
            'title': title,
            'hot': str(hot) if hot is not None else '',
            'url': url if isinstance(url, str) else '',
            'source': source,
        })
    return items


async def fetch_douyin_hot() -> list[dict[str, Any]]:
    now = time.time()
    if HOT_CACHE['data'] and now - HOT_CACHE['ts'] < HOT_CACHE_TTL:
        return HOT_CACHE['data']
    import httpx
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
    }
    async with httpx.AsyncClient(timeout=8.0, headers=headers, follow_redirects=True) as client:
        for source, url in HOT_SOURCES:
            try:
                res = await client.get(url)
                if res.status_code != 200:
                    continue
                data = res.json()
                items = _normalize_hot_items(source, data)
                if items:
                    HOT_CACHE['data'] = items
                    HOT_CACHE['ts'] = now
                    return items
            except Exception:
                continue
    if HOT_CACHE['data']:
        return HOT_CACHE['data']
    items = _fallback_hot_items()
    HOT_CACHE['data'] = items
    HOT_CACHE['ts'] = now
    return items


# ---- Claude 提示词生成 ----

class JimengPrompts(BaseModel):
    title: str = Field(..., description='短而有冲击力的任务标题，6-12个汉字')
    first_prompt: str = Field(..., description='首帧画面提示词，电影级细节，80-160字；包含主体、环境、光线、色调、镜头语言')
    last_prompt: str = Field(..., description='尾帧画面提示词，与首帧形成情绪或视觉上的递进/对比，80-160字')
    video_prompt: str = Field(..., description='视频运镜/过渡提示词，50-100字；描述镜头移动、节奏、情绪变化')
    title_card_text: str = Field(..., description='点题短句，10-20字，有文学感和话题性')
    publish_title: str = Field(..., description='抖音标题，20-30字，带点悬念或情绪钩子')
    publish_description: str = Field(..., description='抖音描述，含 2-4 个#话题标签')
    suggested_post_mode: str = Field(..., description='建议后处理模式，仅从 visual_only / title_card / narrated 中三选一')


OPENAI_BASE_URL = os.environ.get('OPENAI_BASE_URL', 'https://api.codexzh.com/v1')
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', 'sk-7cqicc4VNNTUjNV4CirOJ42bZaFve7eXlF5vBavZprxUnxOM')
OPENAI_MODEL = os.environ.get('OPENAI_MODEL', 'cc-gpt-5.4')

JIMENG_SYSTEM_PROMPT = """你是一位同时精通短视频爆款内容与电影摄影语言的创意总监，服务于一款「即梦 AI 视频生成」的异步工作流工具。

这个工具会按下面顺序生成一条 9:16 竖屏、约 15 秒的短视频：
1. 根据「首帧提示词」生成首帧图 (text2image, 2K, 9:16)。
2. 根据「尾帧提示词」+ 首帧做 image2image 生成尾帧图。
3. 根据「视频提示词」+ 首尾帧做 frames2video，产出 720p 视频。
4. 进入后处理策略层：
   - visual_only: 纯画面，不加字幕与旁白。
   - title_card: 单句点题字幕，电影感定格出现在视频中段。
   - narrated: 生成中文旁白 + Whisper 字幕 + 混音。
5. 最终作为抖音作品发布（标题 + 描述 + 话题）。

你的任务：给定一个「题目/话题」（通常来自抖音热榜或用户输入），产出上述完整的一套字段，使得最终作品：
- 画面具备强电影感、光影层次、情绪指向明确；
- 首帧与尾帧之间存在有呼吸的递进或情绪对照（不是换个机位的同一画面）；
- 视频提示词描述镜头语言（推、拉、摇、升降、变焦、时间流逝、景别切换）与氛围节奏；
- 抖音标题/描述带话题钩子但不标题党、不低俗、不猎奇；
- suggested_post_mode 应根据题目性质取舍：信息/观点重 → narrated；情绪/氛围重 → title_card；纯美学/空镜 → visual_only。

硬约束：
- 所有字段都使用简体中文；
- 所有提示词严格围绕同一个题目，不得出现不相关意象；
- 不出现任何真实姓名、品牌、机构、政治敏感内容；
- title_card_text 只有一句，不含句号；
- publish_description 中至少包含 2 个 # 标签。

输出格式：严格只返回一个 JSON 对象，字段如下（顺序可任意，均为必填字符串）：
{
  "title": "...",
  "first_prompt": "...",
  "last_prompt": "...",
  "video_prompt": "...",
  "title_card_text": "...",
  "publish_title": "...",
  "publish_description": "...",
  "suggested_post_mode": "visual_only | title_card | narrated"
}
不要使用 markdown 代码块，不要写任何解释文字。"""


def _extract_json_object(text: str) -> dict[str, Any] | None:
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        pass
    start = text.find('{')
    end = text.rfind('}')
    if start >= 0 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except Exception:
            return None
    return None


def generate_prompts_with_llm(topic: str) -> dict[str, Any] | None:
    if not OPENAI_API_KEY:
        return None
    try:
        from openai import OpenAI
    except ImportError:
        return None
    try:
        client = OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL, timeout=120.0)
        # 该中转对独立 system 消息兼容性差，合并到 user 消息里更稳
        merged = f"{JIMENG_SYSTEM_PROMPT}\n\n题目：{topic}\n\n请基于这个题目产出完整的即梦工作流字段，只返回 JSON，不要任何解释。"
        messages = [{'role': 'user', 'content': merged}]
        try:
            res = client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=messages,
                response_format={'type': 'json_object'},
            )
        except Exception:
            res = client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=messages,
            )
        content = res.choices[0].message.content if res.choices else ''
        raw = _extract_json_object(content or '')
        if not isinstance(raw, dict):
            return None
        try:
            parsed = JimengPrompts(**raw)
        except Exception:
            return None
        data = parsed.model_dump()
        allowed = {'visual_only', 'title_card', 'narrated'}
        if data.get('suggested_post_mode') not in allowed:
            data['suggested_post_mode'] = 'title_card'
        return data
    except Exception:
        return None


def generate_prompts_fallback(topic: str) -> dict[str, Any]:
    """当没有 ANTHROPIC_API_KEY 或调用失败时的模板兜底。"""
    topic = topic.strip() or '城市的黎明'
    return {
        'title': topic[:12],
        'first_prompt': f'电影级画面，主观视角，围绕「{topic}」的开场镜头，冷色调晨光，细腻颗粒，浅景深，光影有层次，构图留白，1.85:1 电影感，强烈氛围。',
        'last_prompt': f'承接首帧，镜头推远，光线从冷转暖，「{topic}」在画面中心被重新定义，色彩从灰蓝走向琥珀，远景出现希望感的指向物，细节清晰。',
        'video_prompt': f'轻微推镜，缓慢变焦，柔和平移，节奏由静到动；表达「{topic}」从等待到觉醒的情绪弧线；光线随时间推进。',
        'title_card_text': f'关于{topic}，我们还能相信什么',
        'publish_title': f'【{topic}】今天，我想和你聊聊这一幕',
        'publish_description': f'一条关于「{topic}」的 15 秒短片。 #{topic} #即梦AI #电影感短片 #AI短片',
        'suggested_post_mode': 'title_card',
    }


@app.get('/api/hot')
async def hot_list() -> JSONResponse:
    items = await fetch_douyin_hot()
    return JSONResponse({
        'items': items,
        'cached_at': HOT_CACHE['ts'],
        'source': items[0]['source'] if items else '',
    })


@app.get('/api/hot/random')
async def hot_random() -> JSONResponse:
    items = await fetch_douyin_hot()
    if not items:
        raise HTTPException(status_code=503, detail='暂时拿不到抖音热榜，稍后再试')
    pick = random.choice(items)
    return JSONResponse(pick)


@app.post('/api/generate')
async def generate(topic: str = Form(...)) -> JSONResponse:
    topic = topic.strip()
    if not topic:
        raise HTTPException(status_code=400, detail='题目不能为空')
    data = await asyncio.to_thread(generate_prompts_with_llm, topic)
    used = OPENAI_MODEL
    if data is None:
        data = generate_prompts_fallback(topic)
        used = 'fallback'
    data['topic'] = topic
    data['engine'] = used
    return JSONResponse(data)
