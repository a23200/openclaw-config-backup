import asyncio
import json
import mimetypes
import os
import random
import re
import shutil
import subprocess
import sys
import time
import uuid
from functools import lru_cache
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
DREAMINA_BIN_CANDIDATES = [
    Path('/Users/mac/.local/bin/dreamina'),
    Path('/opt/homebrew/bin/dreamina'),
]


def resolve_dreamina_bin() -> str:
    env_path = os.environ.get('DREAMINA_BIN', '').strip()
    if env_path and Path(env_path).exists():
        return env_path
    for candidate in DREAMINA_BIN_CANDIDATES:
        if candidate.exists():
            return str(candidate)
    return 'dreamina'

JIMENG_TIMELINE = [
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
    'narration_script_ready',
    'tts_generating',
    'tts_ready',
    'bgm_mixing',
    'subtitle_transcribing',
    'subtitle_refining',
    'subtitle_burning',
    'final_packaging',
    'mastered',
    'publishing',
    'published',
]

MATERIAL_TIMELINE = [
    'submitted',
    'material_selecting',
    'material_stitching',
    'material_frames2video_submitted',
    'material_frames2video_queued',
    'material_frames2video_ready',
    'video_ready',
    'post_processing',
    'narration_script_ready',
    'tts_generating',
    'tts_ready',
    'bgm_mixing',
    'subtitle_transcribing',
    'subtitle_refining',
    'subtitle_burning',
    'final_packaging',
    'mastered',
    'publishing',
    'published',
]

# Default timeline kept for backwards compat (UI picks per task_type from /api/meta).
STATE_TIMELINE = JIMENG_TIMELINE

TERMINAL_STATES = {'published', 'mastered', 'failed'}

MATERIAL_CATEGORY_PRESETS: dict[str, dict[str, str]] = {
    'auto': {
        'label': '自动判断',
        'post_mode': 'auto',
        'tone': '根据主题自动选择表达方式，保持自然、克制、适合短视频',
        'voice_profile': 'calm_female',
        'narration_style': 'documentary',
        'script_rule': '按主题判断是科普、讲解、情绪还是美学表达，避免空泛套话。',
    },
    'science': {
        'label': '科教科普',
        'post_mode': 'narrated',
        'tone': '清晰、可信、循序渐进，用一句现象引入，再给出直观解释',
        'voice_profile': 'steady_male',
        'narration_style': 'documentary',
        'script_rule': '适合知识解释、原理说明、科学概念，用通俗比喻讲清楚一个点。',
    },
    'explain': {
        'label': '讲解说明',
        'post_mode': 'narrated',
        'tone': '口语化、节奏稳定、信息密度适中，像认真讲给朋友听',
        'voice_profile': 'calm_female',
        'narration_style': 'explain',
        'script_rule': '适合流程、方法、现象说明，开头直接点题，中段解释，结尾留一句记忆点。',
    },
    'opinion': {
        'label': '观点评论',
        'post_mode': 'narrated',
        'tone': '有判断力但不激烈，先抛观点，再给理由，最后收束成一句态度',
        'voice_profile': 'clear_male',
        'narration_style': 'opinion',
        'script_rule': '适合社会观察、生活洞察、趋势分析，避免绝对化和攻击性表达。',
    },
    'list': {
        'label': '清单盘点',
        'post_mode': 'narrated',
        'tone': '轻快、明确、有序，用一二三或几个关键词推进',
        'voice_profile': 'bright_female',
        'narration_style': 'explain',
        'script_rule': '适合多角度展示、N种方式、分类盘点，每段画面对应一个关键词。',
    },
    'healing': {
        'label': '治愈旁白',
        'post_mode': 'narrated',
        'tone': '温柔、慢节奏、有画面感，少解释，多感受',
        'voice_profile': 'warm_female',
        'narration_style': 'emotional',
        'script_rule': '适合自然、城市夜景、宇宙、情绪短片，用短句制造呼吸感。',
    },
    'aesthetic': {
        'label': '美学氛围',
        'post_mode': 'title_card',
        'tone': '克制、高级、留白，字幕只做点题，不解释画面',
        'voice_profile': 'calm_female',
        'narration_style': 'emotional',
        'script_rule': '适合纯画面、美学展示、氛围类素材，优先点题字幕而不是长旁白。',
    },
}

MATERIAL_VOICE_PROFILES: dict[str, dict[str, str]] = {
    'calm_female': {'label': '沉稳女声', 'say_voice': 'Tingting', 'say_rate': '165'},
    'warm_female': {'label': '温柔女声', 'say_voice': 'Sandy (中文（中国大陆）)', 'say_rate': '158'},
    'bright_female': {'label': '明亮女声', 'say_voice': 'Flo (中文（中国大陆）)', 'say_rate': '172'},
    'steady_male': {'label': '稳重男声', 'say_voice': 'Reed (中文（中国大陆）)', 'say_rate': '158'},
    'clear_male': {'label': '清晰男声', 'say_voice': 'Eddy (中文（中国大陆）)', 'say_rate': '168'},
    'elder_male': {'label': '长者男声', 'say_voice': 'Grandpa (中文（中国大陆）)', 'say_rate': '150'},
}

app = FastAPI(title='视频工作流')


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


def ensure_dreamina_not_failed(parsed: dict[str, Any] | None, stage: str) -> None:
    if not parsed:
        return
    status = str(parsed.get('gen_status') or '').strip().lower()
    if status not in {'fail', 'failed', 'error', 'expired', 'canceled', 'cancelled'}:
        return
    reason = parsed.get('fail_reason') or parsed.get('error') or parsed.get('message') or status
    if not isinstance(reason, str) or not reason.strip():
        reason = status
    raise RuntimeError(f'{stage}：{reason}')


def is_valid_image_file(path: Path) -> bool:
    if not path.is_file() or path.suffix.lower() not in {'.png', '.jpg', '.jpeg', '.webp'}:
        return False
    try:
        header = path.read_bytes()[:16]
    except Exception:
        return False
    if header.startswith(b'\x89PNG\r\n\x1a\n'):
        return True
    if header.startswith(b'\xff\xd8\xff'):
        return True
    if header.startswith(b'RIFF') and b'WEBP' in header[8:16]:
        return True
    return False


def pick_latest_image(folder: Path, exclude_names: set[str] | None = None) -> Path | None:
    names = exclude_names or set()
    images = [path for path in folder.iterdir() if path.name not in names and is_valid_image_file(path)]
    return sorted(images, key=lambda path: path.stat().st_mtime)[-1] if images else None


def run_args(args: list[str], cwd: str | None = None, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    merged_env = os.environ.copy()
    merged_env['PATH'] = ':'.join([
        '/Users/mac/.local/bin',
        '/opt/homebrew/bin',
        '/opt/homebrew/sbin',
        merged_env.get('PATH', ''),
    ])
    if env:
        merged_env.update(env)
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, env=merged_env)


import socket
import urllib.request
import urllib.error
from . import douyin_cdp_publisher
from . import material_pipeline
from .postprocess import NarratedStrategy, PostprocessContext, PureVisualStrategy, ThemeSubtitleStrategy
from .postprocess.burn_subtitles import ass_style_line, resolve_subtitle_theme
from .postprocess.openai_tts import generate_openai_tts

CHROME_APP_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
CHROME_DEBUG_PORT = 9222
CHROME_DEBUG_HOST = '127.0.0.1'
CHROME_USER_DATA_DIR = str(Path.home() / 'Library' / 'Application Support' / 'Jimeng-Publish-Chrome')
CHROME_PORT_HINTS = (CHROME_DEBUG_PORT, 9333, 9444, 9555)
CHROME_ACTIVE_PORT_FILE = Path(CHROME_USER_DATA_DIR) / '.cdp-port'


def _cdp_endpoint_for_port(port: int) -> str:
    return f'http://{CHROME_DEBUG_HOST}:{port}'


def _remember_active_debug_port(port: int) -> None:
    try:
        Path(CHROME_USER_DATA_DIR).mkdir(parents=True, exist_ok=True)
        CHROME_ACTIVE_PORT_FILE.write_text(str(port), encoding='utf-8')
    except Exception:
        pass


def _read_active_debug_port() -> int | None:
    try:
        value = CHROME_ACTIVE_PORT_FILE.read_text(encoding='utf-8').strip()
        port = int(value)
        return port if port > 0 else None
    except Exception:
        return None


def _candidate_debug_ports() -> list[int]:
    ports: list[int] = []
    remembered = _read_active_debug_port()
    for port in (remembered, *CHROME_PORT_HINTS):
        if isinstance(port, int) and port > 0 and port not in ports:
            ports.append(port)
    return ports


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


def _cdp_version_info(port: int, timeout: float = 1.0) -> dict[str, Any] | None:
    """GET /json/version on the CDP port — confirms the port is real CDP, not a
    stray listener, and returns the Chrome version + webSocketDebuggerUrl."""
    try:
        with urllib.request.urlopen(f'{_cdp_endpoint_for_port(port)}/json/version', timeout=timeout) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        return None


def _discover_debug_cdp() -> tuple[int, dict[str, Any]] | tuple[None, None]:
    for port in _candidate_debug_ports():
        if not _port_open(CHROME_DEBUG_HOST, port):
            continue
        ver = _cdp_version_info(port)
        if ver is not None:
            _remember_active_debug_port(port)
            return port, ver
    return None, None


def _current_cdp_endpoint() -> str:
    port, _ = _discover_debug_cdp()
    return _cdp_endpoint_for_port(port or CHROME_DEBUG_PORT)


def _chrome_process_running() -> bool:
    try:
        res = subprocess.run(
            ['pgrep', '-f', '--', f'--user-data-dir={CHROME_USER_DATA_DIR}'],
            capture_output=True, text=True, timeout=2,
        )
        return bool(res.stdout.strip())
    except Exception:
        return False


def _terminate_debug_chrome(wait_sec: float = 5.0) -> None:
    try:
        subprocess.run(
            ['pkill', '-f', '--', f'--user-data-dir={CHROME_USER_DATA_DIR}'],
            capture_output=True, text=True, timeout=2,
        )
    except Exception:
        pass
    deadline = time.time() + wait_sec
    while time.time() < deadline:
        if not _chrome_process_running():
            return
        time.sleep(0.2)


def _launch_debug_chrome() -> dict[str, Any]:
    """Launch the long-lived debug Chrome if it's not already running.

    Uses a fixed user-data-dir (~/.jimeng-publish-chrome) so the user logs into
    Douyin once and the cookies persist across restarts. Chrome 136+ accepts
    --remote-debugging-port ONLY on non-default profiles, which is why we use
    a dedicated user-data-dir here.
    """
    Path(CHROME_USER_DATA_DIR).mkdir(parents=True, exist_ok=True)
    running_port, ver = _discover_debug_cdp()
    if running_port and ver:
        return {
            'ok': True,
            'already_running': True,
            'endpoint': _cdp_endpoint_for_port(running_port),
            'debug_port': running_port,
        }
    if not Path(CHROME_APP_PATH).exists():
        return {'ok': False, 'error': f'找不到 Chrome: {CHROME_APP_PATH}'}
    if _chrome_process_running():
        _terminate_debug_chrome()
    launch_port = next((port for port in _candidate_debug_ports() if not _port_open(CHROME_DEBUG_HOST, port)), None)
    if launch_port is None:
        return {'ok': False, 'error': f'调试端口都被占用：{", ".join(str(p) for p in _candidate_debug_ports())}'}
    args = [
        CHROME_APP_PATH,
        f'--remote-debugging-port={launch_port}',
        f'--user-data-dir={CHROME_USER_DATA_DIR}',
        '--no-first-run',
        '--no-default-browser-check',
        'https://creator.douyin.com',
    ]
    subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    deadline = time.time() + 15
    while time.time() < deadline:
        if _port_open(CHROME_DEBUG_HOST, launch_port) and _cdp_version_info(launch_port):
            _remember_active_debug_port(launch_port)
            return {
                'ok': True,
                'already_running': False,
                'endpoint': _cdp_endpoint_for_port(launch_port),
                'debug_port': launch_port,
            }
        time.sleep(0.3)
    return {'ok': False, 'error': f'Chrome 启动后 15s 内 {CHROME_DEBUG_HOST}:{launch_port} 仍未就绪'}


class PublishConfig(BaseModel):
    videoPath: str
    title: str
    description: str
    tags: list[str] = Field(default_factory=lambda: ['Claw Link', 'AI短片', '电影感'])
    coverPath: str


def extract_cover_candidate(folder: Path, video: Path) -> Path | None:
    cover = folder / 'cover_candidate.jpg'
    if cover.exists() and cover.stat().st_size > 1024:
        return cover
    try:
        duration = ffprobe_duration(video)
    except Exception:
        duration = 0
    seek_at = 0.8 if duration <= 1 else min(max(duration * 0.2, 0.8), max(duration - 0.2, 0.8))
    result = run_args([
        'ffmpeg', '-y',
        '-ss', f'{seek_at:.2f}',
        '-i', str(video),
        '-frames:v', '1',
        '-q:v', '2',
        str(cover),
    ])
    if result.returncode == 0 and cover.exists() and cover.stat().st_size > 1024:
        return cover
    return None


def pick_cover_path(folder: Path, choice: str = 'auto', video: Path | None = None) -> Path | None:
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
    if pngs:
        return pngs[0]
    if video is not None and video.exists():
        return extract_cover_candidate(folder, video)
    return None


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
    cover = pick_cover_path(folder, cover_choice, video)
    if cover is None:
        return None
    title = state['publish'].get('title') or state['title']
    description = state['publish'].get('description') or f"{state['title']} #ClawLink #AI短片"
    cfg = PublishConfig(videoPath=str(video), title=title, description=description, coverPath=str(cover))
    out = folder / 'douyin_publish.json'
    out.write_text(cfg.model_dump_json(indent=2), encoding='utf-8')
    write_publish_preview(folder, state, cfg, video, cover)
    return cfg, out


def write_publish_preview(folder: Path, state: dict[str, Any], cfg: PublishConfig, video: Path, cover: Path) -> None:
    try:
        duration = ffprobe_duration(video)
    except Exception:
        duration = 0.0
    file_size = video.stat().st_size if video.exists() else 0
    tags = re.findall(r'#([^\s#]+)', cfg.description or '')
    checklist = {
        'video_exists': video.exists(),
        'cover_exists': cover.exists(),
        'duration_ok': 3 <= duration <= 300,
        'title_length_ok': 5 <= len(cfg.title) <= 55,
        'description_ok': bool((cfg.description or '').strip()),
        'tags_ok': len(tags) >= 2,
        'file_size_ok': file_size > 1024 and file_size < 4 * 1024 * 1024 * 1024,
        'subtitle_burned_or_external': bool(state.get('subtitle_mode') or (folder / 'subtitles.srt').exists()),
    }
    preview = {
        'videoPath': cfg.videoPath,
        'coverPath': cfg.coverPath,
        'title': cfg.title,
        'description': cfg.description,
        'tags': tags or cfg.tags,
        'duration_sec': round(duration, 3),
        'file_size': file_size,
        'subtitle_mode': state.get('subtitle_mode', ''),
        'subtitle_backend': state.get('subtitle_backend', ''),
    }
    (folder / 'publish_preview.json').write_text(json.dumps(preview, ensure_ascii=False, indent=2), encoding='utf-8')
    (folder / 'publish_checklist.json').write_text(json.dumps(checklist, ensure_ascii=False, indent=2), encoding='utf-8')


def publish_preflight() -> dict[str, Any]:
    """CDP readiness check.

    We attach to a long-lived dedicated debug Chrome (fixed user-data-dir at
    ~/.jimeng-publish-chrome, launched with --remote-debugging-port=9222). The
    user logs into Douyin once in that window; cookies persist forever.
    """
    active_port, ver = _discover_debug_cdp()
    port_up = _port_open(CHROME_DEBUG_HOST, CHROME_DEBUG_PORT)
    proc_up = _chrome_process_running()
    ready = active_port is not None and ver is not None
    return {
        'ready': ready,
        'backend': 'cdp',
        'cdp_endpoint': _cdp_endpoint_for_port(active_port or CHROME_DEBUG_PORT),
        'debug_port': active_port or CHROME_DEBUG_PORT,
        'port_open': port_up,
        'cdp_ok': ready,
        'chrome_version': (ver or {}).get('Browser', ''),
        'process_running': proc_up,
        'user_data_dir': CHROME_USER_DATA_DIR,
        'port_candidates': list(_candidate_debug_ports()),
    }


def publish_to_douyin(folder: Path, config_path: Path) -> dict[str, Any]:
    """Publish via CDP. Persists result JSON next to the log."""
    result_path = folder / 'douyin_publish_result.json'
    result = douyin_cdp_publisher.publish_via_cdp(folder, config_path, endpoint=_current_cdp_endpoint())
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
            _current_cdp_endpoint(), fallback_url='https://creator.douyin.com'
        )
        with sync_playwright() as pw:
            browser = pw.chromium.connect_over_cdp(_current_cdp_endpoint(), timeout=5000)
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


def material_category_preset(category: str) -> dict[str, str]:
    return MATERIAL_CATEGORY_PRESETS.get(category, MATERIAL_CATEGORY_PRESETS['auto'])


def material_voice_profile(profile: str) -> dict[str, str]:
    return MATERIAL_VOICE_PROFILES.get(profile, MATERIAL_VOICE_PROFILES['calm_female'])


def build_material_title_card(topic: str, category: str = 'auto') -> str:
    topic = topic.strip() or '这段画面'
    if category == 'science':
        return f'{topic}背后的原理'
    if category == 'explain':
        return f'把{topic}讲清楚'
    if category == 'opinion':
        return f'重新理解{topic}'
    if category == 'list':
        return f'{topic}的几个角度'
    if category == 'healing':
        return f'慢慢靠近{topic}'
    if category == 'aesthetic':
        return f'{topic}正在发生'
    return f'关于{topic}的一段观察'


def build_material_fallback_narration(topic: str, category: str = 'auto') -> str:
    preset = material_category_preset(category)
    pseudo_state = {
        'task_type': 'material',
        'title': topic,
        'input': {'topic': topic, 'material_category': category},
        'post': {'material_category': category, 'narration_style': preset.get('narration_style', 'documentary')},
    }
    return make_narration_text(topic, pseudo_state)


def make_narration_text(title: str, state: dict[str, Any] | None = None) -> str:
    if state:
        custom = str(state.get('post', {}).get('narration_text') or '').strip()
        if custom:
            return custom
        if state.get('task_type') == 'material':
            topic = str(state.get('input', {}).get('topic') or title).strip() or title
            category = str(state.get('post', {}).get('material_category') or state.get('input', {}).get('material_category') or 'auto')
            preset = material_category_preset(category)
            if category == 'science':
                return f"{topic}，看起来很遥远，其实只要抓住一个关键点就能理解。画面里的变化，不是在展示结果，而是在帮我们看见背后的原理。"
            if category == 'explain':
                return f"这条视频想讲清楚的是：{topic}。先看整体，再看细节，最后你会发现，它真正重要的不是形式，而是它如何进入我们的日常。"
            if category == 'opinion':
                return f"关于{topic}，我更愿意把它看成一种正在发生的变化。它不只是画面里的风格，而是我们重新理解生活的一种方式。"
            if category == 'list':
                return f"{topic}，可以从几个角度来看。第一是画面里的元素，第二是它出现的场景，第三是它留下的感受。真正打动人的，往往是这些细节。"
            if category == 'healing':
                return f"{topic}，不需要被急着解释。慢一点看，光线、颜色和远处的变化，都会把情绪轻轻带到更安静的地方。"
            if category == 'aesthetic':
                return str(state.get('post', {}).get('title_card_text') or topic)
            return f"{topic}。{preset['script_rule']}这条短片用固定素材重新组织节奏，把主题变成一段更容易被看见的内容。"
    return f"{title}。穿过黑暗，前面就是早晨。只要你还在往前开，希望就还在路上。"


def decide_post_mode(state: dict[str, Any]) -> str:
    configured = state.get('post', {}).get('mode', 'auto')
    if configured != 'auto':
        return configured
    if state.get('task_type') == 'material':
        category = str(state.get('post', {}).get('material_category') or state.get('input', {}).get('material_category') or 'auto')
        preset_mode = material_category_preset(category).get('post_mode')
        if preset_mode and preset_mode != 'auto':
            return preset_mode
        if str(state.get('post', {}).get('narration_text') or '').strip():
            return 'narrated'
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


def generate_tts_audio_with_say(text: str, output_path: Path, voice_profile: str = 'calm_female') -> subprocess.CompletedProcess[str]:
    temp_aiff = output_path.with_suffix('.aiff')
    if temp_aiff.exists():
        temp_aiff.unlink()
    voice_meta = material_voice_profile(voice_profile)
    say_voice = voice_meta.get('say_voice') or 'Tingting'
    say_rate = voice_meta.get('say_rate') or '165'
    attempts: list[str] = []
    for args in (
        ['say', '-v', say_voice, '-r', say_rate, text, '-o', str(temp_aiff)],
        ['say', '-r', say_rate, text, '-o', str(temp_aiff)],
    ):
        res = run_args(args)
        attempts.append((res.stderr or res.stdout).strip())
        if res.returncode != 0 or not temp_aiff.exists():
            continue
        convert_res = run_args([
            'ffmpeg', '-y',
            '-i', str(temp_aiff),
            '-vn',
            '-ar', '44100',
            '-ac', '2',
            '-acodec', 'libmp3lame',
            '-b:a', '192k',
            str(output_path),
        ])
        temp_aiff.unlink(missing_ok=True)
        attempts.append((convert_res.stderr or convert_res.stdout).strip())
        if convert_res.returncode == 0 and output_path.exists():
            return subprocess.CompletedProcess(
                args=['say'],
                returncode=0,
                stdout=convert_res.stdout,
                stderr=convert_res.stderr,
            )
    temp_aiff.unlink(missing_ok=True)
    return subprocess.CompletedProcess(
        args=['say'],
        returncode=1,
        stdout='',
        stderr='\n'.join(part for part in attempts if part),
    )


def generate_tts_audio_with_edge(text: str, output_path: Path, voice_profile: str = 'calm_female') -> subprocess.CompletedProcess[str]:
    edge_profiles = {
        'calm_female': ('zh-CN-XiaoxiaoNeural', '-6%'),
        'warm_female': ('zh-CN-XiaoyiNeural', '-10%'),
        'bright_female': ('zh-CN-XiaoxiaoNeural', '+0%'),
        'steady_male': ('zh-CN-YunyangNeural', '-8%'),
        'clear_male': ('zh-CN-YunxiNeural', '-4%'),
        'elder_male': ('zh-CN-YunyangNeural', '-12%'),
    }
    voice, rate = edge_profiles.get(voice_profile, edge_profiles['calm_female'])
    temp_path = output_path.with_suffix('.edge.mp3')
    temp_path.unlink(missing_ok=True)
    res = run_args([
        sys.executable,
        '-m', 'edge_tts',
        '--voice', voice,
        '--rate', rate,
        '--text', text,
        '--write-media', str(temp_path),
    ])
    if res.returncode != 0 or not temp_path.exists():
        temp_path.unlink(missing_ok=True)
        return res
    convert_res = run_args([
        'ffmpeg', '-y',
        '-i', str(temp_path),
        '-vn',
        '-ar', '44100',
        '-ac', '2',
        '-acodec', 'libmp3lame',
        '-b:a', '192k',
        str(output_path),
    ])
    temp_path.unlink(missing_ok=True)
    if convert_res.returncode == 0 and output_path.exists():
        return subprocess.CompletedProcess(
            args=['edge_tts'],
            returncode=0,
            stdout=convert_res.stdout,
            stderr=convert_res.stderr,
        )
    return convert_res


def generate_tts_audio(text: str, output_path: Path, voice_profile: str = 'calm_female', prefer_say: bool = False) -> subprocess.CompletedProcess[str]:
    output_path.unlink(missing_ok=True)
    voice_map = {
        'calm_female': 'nova',
        'warm_female': 'shimmer',
        'bright_female': 'alloy',
        'steady_male': 'echo',
        'clear_male': 'fable',
        'elder_male': 'onyx',
    }
    if not prefer_say:
        try:
            generate_openai_tts(text, output_path, voice=voice_map.get(voice_profile, 'nova'))
            return subprocess.CompletedProcess(args=['openai_tts'], returncode=0, stdout='openai tts ok', stderr='')
        except Exception as exc:
            primary_error = str(exc)
        edge = generate_tts_audio_with_edge(text, output_path, voice_profile)
        if edge.returncode == 0 and output_path.exists():
            edge.stderr = '\n'.join(part for part in [primary_error, edge.stderr] if part)
            return edge
        fallback = generate_tts_audio_with_say(text, output_path, voice_profile)
        if fallback.returncode == 0 and output_path.exists():
            fallback.stderr = '\n'.join(part for part in [primary_error, (edge.stderr or edge.stdout), fallback.stderr] if part)
            return fallback
        return subprocess.CompletedProcess(
            args=fallback.args,
            returncode=fallback.returncode or 1,
            stdout='\n'.join(part for part in [edge.stdout, fallback.stdout] if part),
            stderr='\n'.join(part for part in [primary_error, (edge.stderr or edge.stdout), (fallback.stderr or fallback.stdout)] if part),
        )
    fallback = generate_tts_audio_with_say(text, output_path, voice_profile)
    if fallback.returncode == 0 and output_path.exists():
        return fallback
    return fallback


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


def ffprobe_video_size(path: Path) -> tuple[int, int]:
    res = run_args([
        'ffprobe', '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', str(path),
    ])
    if res.returncode != 0:
        raise RuntimeError(res.stderr or res.stdout)
    raw = (res.stdout or '').strip()
    width_s, height_s = raw.split('x', 1)
    return int(width_s), int(height_s)


def parse_srt_timestamp(raw: str) -> float:
    hms, ms = raw.strip().split(',', 1)
    hours, minutes, seconds = [int(part) for part in hms.split(':')]
    return hours * 3600 + minutes * 60 + seconds + int(ms) / 1000.0


def parse_srt_entries(srt_path: Path) -> list[dict[str, Any]]:
    content = srt_path.read_text(encoding='utf-8').strip()
    if not content:
        return []
    entries: list[dict[str, Any]] = []
    for block in re.split(r'\n\s*\n', content):
        lines = [line.rstrip() for line in block.splitlines() if line.strip()]
        if not lines:
            continue
        timing_index = next((idx for idx, line in enumerate(lines) if '-->' in line), -1)
        if timing_index < 0 or timing_index == len(lines) - 1:
            continue
        start_raw, end_raw = [item.strip() for item in lines[timing_index].split('-->')]
        text = '\n'.join(lines[timing_index + 1:]).strip()
        if not text:
            continue
        entries.append({
            'start': parse_srt_timestamp(start_raw),
            'end': parse_srt_timestamp(end_raw),
            'text': text,
        })
    return entries


def srt_to_ass(srt_path: Path, ass_path: Path, subtitle_theme: str = 'douyin_bold') -> None:
    content = srt_path.read_text(encoding='utf-8').strip()
    blocks = re.split(r'\n\s*\n', content)
    header = (
        '[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n'
        'WrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\n'
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, '
        'Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, '
        'Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n'
        f'{ass_style_line(subtitle_theme)}\n\n[Events]\n'
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'
    )
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


@lru_cache(maxsize=1)
def ffmpeg_filter_names() -> set[str]:
    res = run_args(['ffmpeg', '-hide_banner', '-filters'])
    if res.returncode != 0:
        return set()
    names: set[str] = set()
    for line in (res.stdout or '').splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith('Filters:') or stripped.startswith('-'):
            continue
        parts = stripped.split()
        if len(parts) >= 2 and re.fullmatch(r'[A-Z.TSC|]+', parts[0]):
            names.add(parts[1])
    return names


def subtitle_burn_filter() -> str | None:
    names = ffmpeg_filter_names()
    if 'subtitles' in names:
        return 'subtitles'
    if 'ass' in names:
        return 'ass'
    return None


def subtitle_burn_unavailable(detail: str = '') -> bool:
    if subtitle_burn_filter() is None:
        return True
    return "No such filter: 'subtitles'" in detail or "No such filter: 'ass'" in detail


def subtitle_burn_error_message(detail: str = '') -> str:
    if subtitle_burn_unavailable(detail):
        return 'ffmpeg 当前构建缺少 subtitles/ass filter，已降级为外挂字幕交付'
    return detail.strip() or '字幕烧录失败，已降级为外挂字幕交付'


def resolve_subtitle_font_path() -> str:
    candidates = [
        Path('/System/Library/Fonts/STHeiti Medium.ttc'),
        Path('/System/Library/Fonts/STHeiti Light.ttc'),
        Path('/System/Library/Fonts/PingFang.ttc'),
        Path('/System/Library/Fonts/Supplemental/PingFang.ttc'),
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    raise RuntimeError('未找到可用中文字体')


def wrap_subtitle_text(text: str, font, max_width: int, stroke_width: int = 3) -> str:
    from PIL import Image, ImageDraw

    draw = ImageDraw.Draw(Image.new('RGBA', (max_width, 200), (0, 0, 0, 0)))
    lines: list[str] = []
    for paragraph in text.splitlines() or [text]:
        current = ''
        for char in paragraph:
            trial = current + char
            bbox = draw.textbbox((0, 0), trial, font=font, stroke_width=stroke_width)
            if current and (bbox[2] - bbox[0]) > max_width:
                lines.append(current)
                current = char
            else:
                current = trial
        if current:
            lines.append(current)
    return '\n'.join(lines)


def render_subtitle_overlay(text: str, out_path: Path, video_size: tuple[int, int], subtitle_theme: str = 'douyin_bold') -> None:
    from PIL import Image, ImageDraw, ImageFont

    width, height = video_size
    theme = resolve_subtitle_theme(subtitle_theme)
    font_path = resolve_subtitle_font_path()
    font_size = max(theme.min_font_size, int(width * theme.font_scale))
    font = ImageFont.truetype(font_path, font_size)
    max_width = int(width * theme.max_width_ratio)
    wrapped = wrap_subtitle_text(text, font, max_width, theme.stroke_width)

    image = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    bbox = draw.multiline_textbbox((0, 0), wrapped, font=font, spacing=theme.line_spacing, align='center', stroke_width=theme.stroke_width)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (width - text_width) / 2 - bbox[0]
    y = height - text_height - int(height * theme.margin_bottom_ratio)
    pad_x = max(24, int(width * 0.03))
    pad_y = max(18, int(height * 0.012))
    if theme.box_enabled:
        box_red, box_green, box_blue, _ = theme.box_rgba
        draw.rounded_rectangle(
            (
                x + bbox[0] - pad_x,
                y + bbox[1] - pad_y,
                x + bbox[2] + pad_x,
                y + bbox[3] + pad_y,
            ),
            radius=max(16, int(width * 0.02)),
            fill=(box_red, box_green, box_blue, theme.box_opacity),
        )
    if theme.shadow_offset > 0:
        draw.multiline_text(
            (x + theme.shadow_offset, y + theme.shadow_offset),
            wrapped,
            font=font,
            fill=theme.shadow_rgba,
            align='center',
            spacing=theme.line_spacing,
        )
    draw.multiline_text(
        (x, y),
        wrapped,
        font=font,
        fill=theme.fill_rgba,
        stroke_width=theme.stroke_width,
        stroke_fill=theme.stroke_rgba,
        align='center',
        spacing=theme.line_spacing,
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(out_path)


def burn_subtitles_with_overlay(video_path: Path, srt_path: Path, output_path: Path, work_dir: Path, subtitle_theme: str = 'douyin_bold') -> subprocess.CompletedProcess[str]:
    entries = parse_srt_entries(srt_path)
    if not entries:
        shutil.copy2(video_path, output_path)
        return subprocess.CompletedProcess(args=['cp'], returncode=0, stdout='', stderr='')

    video_size = ffprobe_video_size(video_path)
    overlay_dir = work_dir / 'subtitle_overlays'
    if overlay_dir.exists():
        shutil.rmtree(overlay_dir)
    overlay_dir.mkdir(parents=True, exist_ok=True)

    args = ['ffmpeg', '-y', '-i', str(video_path)]
    filter_parts: list[str] = []
    current_label = '0:v'

    for idx, entry in enumerate(entries, start=1):
        overlay_path = overlay_dir / f'{idx:03d}.png'
        render_subtitle_overlay(str(entry['text']), overlay_path, video_size, subtitle_theme)
        args.extend(['-loop', '1', '-i', str(overlay_path)])
        next_label = f'v{idx}'
        filter_parts.append(
            f'[{current_label}][{idx}:v]overlay=0:0:enable=\'between(t,{entry["start"]:.3f},{entry["end"]:.3f})\'[{next_label}]'
        )
        current_label = next_label

    args.extend([
        '-filter_complex', ';'.join(filter_parts),
        '-map', f'[{current_label}]',
        '-map', '0:a?',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-c:a', 'copy',
        '-shortest',
        str(output_path),
    ])
    return run_args(args)


def ffmpeg_subtitle_filter(subtitle_path: Path) -> str:
    path = str(subtitle_path).replace('\\', '/').replace(':', '\\:').replace(',', '\\,').replace('[', '\\[').replace(']', '\\]')
    filter_name = subtitle_burn_filter()
    if filter_name == 'subtitles':
        return f"subtitles=filename={path}"
    if filter_name == 'ass':
        return f"ass=filename={path}"
    raise RuntimeError('ffmpeg 当前构建缺少 subtitles/ass filter')


def burn_subtitles_only(video_path: Path, subtitle_path: Path, output_path: Path) -> subprocess.CompletedProcess[str]:
    return run_args(['ffmpeg', '-y', '-i', str(video_path), '-vf', ffmpeg_subtitle_filter(subtitle_path), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'copy', str(output_path)])


def merge_audio_video_only(video_path: Path, audio_path: Path, output_path: Path) -> subprocess.CompletedProcess[str]:
    return run_args(['ffmpeg', '-y', '-i', str(video_path), '-i', str(audio_path), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-shortest', str(output_path)])


def merge_audio_video_with_subtitles(video_path: Path, audio_path: Path, subtitle_path: Path, output_path: Path) -> subprocess.CompletedProcess[str]:
    return run_args(['ffmpeg', '-y', '-i', str(video_path), '-i', str(audio_path), '-vf', ffmpeg_subtitle_filter(subtitle_path), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-shortest', str(output_path)])


def download_by_query(submit_id: str, download_dir: Path) -> subprocess.CompletedProcess[str]:
    return run_args([resolve_dreamina_bin(), 'query_result', f'--submit_id={submit_id}', f'--download_dir={download_dir}'])


def find_latest_video(folder: Path) -> Path | None:
    videos = [p for p in folder.glob('*.mp4') if p.name not in {'final_mastered.mp4'}]
    return sorted(videos, key=lambda p: p.stat().st_mtime)[-1] if videos else None


async def finalize_video_if_available(job_id: str, state: dict[str, Any], folder: Path) -> bool:
    final_path = folder / 'final.mp4'
    latest = find_latest_video(folder)
    if latest and latest != final_path:
        shutil.copy2(latest, final_path)
    if not final_path.exists():
        return False
    state['status'] = 'video_ready'
    state['output'] = str(final_path)
    write_status(job_id, state)
    await process_video_output(job_id, final_path, state, folder)
    return True


async def poll_video_until_ready(job_id: str, state: dict[str, Any], folder: Path, video_submit_id: str) -> None:
    if await finalize_video_if_available(job_id, state, folder):
        return
    while True:
        state['status'] = 'video_querying'
        write_status(job_id, state)
        query_res = download_by_query(video_submit_id, folder)
        (folder / 'video_query.log').write_text((query_res.stdout or '') + '\n' + (query_res.stderr or ''), encoding='utf-8')
        if query_res.returncode != 0:
            raise RuntimeError(query_res.stderr or query_res.stdout)
        ensure_dreamina_not_failed(parse_result_json(query_res.stdout), '视频生成失败')
        if await finalize_video_if_available(job_id, state, folder):
            return
        await asyncio.sleep(120)


def build_postprocess_strategy(chosen_post_mode: str):
    if chosen_post_mode == 'visual_only':
        return PureVisualStrategy()
    if chosen_post_mode == 'narrated':
        return NarratedStrategy(
            make_narration_text=make_narration_text,
            generate_tts_audio=generate_tts_audio,
            transcribe_with_whisper=transcribe_with_whisper,
            write_simple_srt=write_simple_srt,
            srt_to_ass=srt_to_ass,
            merge_audio_video_only=merge_audio_video_only,
            run_args=run_args,
            subtitle_burn_filter=subtitle_burn_filter,
            burn_subtitles_with_overlay=burn_subtitles_with_overlay,
            burn_subtitles_only=burn_subtitles_only,
            subtitle_burn_error_message=subtitle_burn_error_message,
        )
    return ThemeSubtitleStrategy(
        write_title_card_srt=write_title_card_srt,
        write_simple_srt=write_simple_srt,
        srt_to_ass=srt_to_ass,
        subtitle_burn_filter=subtitle_burn_filter,
        burn_subtitles_with_overlay=burn_subtitles_with_overlay,
        burn_subtitles_only=burn_subtitles_only,
        subtitle_burn_error_message=subtitle_burn_error_message,
    )


async def process_video_output(job_id: str, final_path: Path, state: dict[str, Any], folder: Path) -> None:
    """Post-processing + auto-publish. Shared by Jimeng and Material pipelines.

    Entry contract: `final_path` is an existing mp4, state['status'] is
    'video_ready', state already written once by the caller.
    """
    state['status'] = 'post_processing'
    write_status(job_id, state)
    state.setdefault('post', {})
    duration = ffprobe_duration(final_path)
    chosen_post_mode = decide_post_mode(state)
    state['post']['resolved_mode'] = chosen_post_mode
    state.pop('subtitle_error', None)
    state.pop('subtitle_mode', None)
    state.pop('subtitle_backend', None)
    write_status(job_id, state)

    strategy = build_postprocess_strategy(chosen_post_mode)
    def update_postprocess_status(status: str) -> None:
        state['status'] = status
        write_status(job_id, state)

    context = PostprocessContext(
        job_id=job_id,
        state=state,
        folder=folder,
        final_path=final_path,
        duration=duration,
        status_callback=update_postprocess_status,
    )
    result = strategy.run(context)

    if result.metadata.get('tts_engine'):
        state['post']['tts_engine'] = result.metadata['tts_engine']
    is_material_task = state.get('task_type') == 'material'
    if is_material_task and result.metadata.get('voice_style_config'):
        state['post']['voice_style_config'] = result.metadata['voice_style_config']
    if is_material_task and result.metadata.get('mix_params'):
        state['post']['mix_params'] = result.metadata['mix_params']
    if is_material_task and result.metadata.get('subtitle_style'):
        state['post']['subtitle_style'] = result.metadata['subtitle_style']
    if is_material_task and result.metadata.get('voiceover_normalized'):
        state['post']['voiceover_normalized'] = result.metadata['voiceover_normalized']
    if result.subtitle_mode:
        state['subtitle_mode'] = result.subtitle_mode
    if result.subtitle_backend:
        state['subtitle_backend'] = result.subtitle_backend
    if result.subtitle_error:
        state['subtitle_error'] = result.subtitle_error

    state['status'] = 'mastered'
    state['output'] = str(result.final_video)
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
        result = await asyncio.to_thread(publish_to_douyin, folder, publish_json)
        state['publish_result'] = result
        if result['status'] != 'ok':
            raise RuntimeError('抖音发布失败: ' + (result.get('error') or 'unknown'))
        state['status'] = 'published'
        write_status(job_id, state)


async def process_job(job_id: str) -> None:
    state = read_status(job_id)
    folder = job_dir(job_id)
    try:
        if (
            state.get('task_type') == 'jimeng'
            and state.get('status') in {'video_queued', 'video_querying'}
            and state.get('video_submit_id')
        ):
            await poll_video_until_ready(job_id, state, folder, str(state['video_submit_id']))
            return

        if state.get('task_type') == 'material':
            final_path = await material_pipeline.run_material_pipeline(
                job_id=job_id,
                state=state,
                folder=folder,
                write_status=write_status,
                dreamina_bin=resolve_dreamina_bin(),
            )
            state['status'] = 'video_ready'
            state['output'] = str(final_path)
            write_status(job_id, state)
            await process_video_output(job_id, final_path, state, folder)
            return

        first_path = folder / 'first_frame.png'
        last_path = folder / 'last_frame.png'

        state['status'] = 'first_frame_generating'
        write_status(job_id, state)
        first_res = run_args([resolve_dreamina_bin(), 'text2image', f"--prompt={state['input']['first_prompt']}", '--ratio=9:16', '--resolution_type=2k', '--poll=60'])
        if first_res.returncode != 0:
            raise RuntimeError(first_res.stderr or first_res.stdout)
        (folder / 'first_frame_result.json').write_text(first_res.stdout, encoding='utf-8')
        first_parsed = parse_result_json(first_res.stdout)
        ensure_dreamina_not_failed(first_parsed, '首帧生成失败')
        first_submit_id = extract_submit_id(first_parsed)
        state['first_submit_id'] = first_submit_id or ''
        write_status(job_id, state)
        if first_submit_id:
            state['status'] = 'first_frame_querying'
            write_status(job_id, state)
            query_res = download_by_query(first_submit_id, folder)
            if query_res.returncode != 0:
                raise RuntimeError(query_res.stderr or query_res.stdout)
            ensure_dreamina_not_failed(parse_result_json(query_res.stdout), '首帧生成失败')
        chosen = pick_latest_image(folder)
        if chosen:
            if chosen != first_path:
                shutil.copy2(chosen, first_path)
        if not is_valid_image_file(first_path):
            raise RuntimeError('首帧下载失败')

        state['status'] = 'last_frame_generating'
        write_status(job_id, state)
        last_res = run_args([resolve_dreamina_bin(), 'image2image', '--images', str(first_path), f"--prompt={state['input']['last_prompt']}", '--ratio=9:16', '--resolution_type=2k', '--poll=60'])
        if last_res.returncode != 0:
            raise RuntimeError(last_res.stderr or last_res.stdout)
        (folder / 'last_frame_result.json').write_text(last_res.stdout, encoding='utf-8')
        last_parsed = parse_result_json(last_res.stdout)
        ensure_dreamina_not_failed(last_parsed, '尾帧生成失败')
        last_submit_id = extract_submit_id(last_parsed)
        state['last_submit_id'] = last_submit_id or ''
        write_status(job_id, state)
        if last_submit_id:
            state['status'] = 'last_frame_querying'
            write_status(job_id, state)
            query_res = download_by_query(last_submit_id, folder)
            if query_res.returncode != 0:
                raise RuntimeError(query_res.stderr or query_res.stdout)
            ensure_dreamina_not_failed(parse_result_json(query_res.stdout), '尾帧生成失败')
        chosen = pick_latest_image(folder, {'first_frame.png'})
        if chosen:
            if chosen != last_path:
                shutil.copy2(chosen, last_path)
        if not is_valid_image_file(last_path):
            raise RuntimeError('尾帧下载失败')

        state['status'] = 'video_submitted'
        write_status(job_id, state)
        if state['video'].get('mode') == 'multimodal2video':
            args = [resolve_dreamina_bin(), 'multimodal2video', '--image', str(first_path), f"--prompt={state['input']['video_prompt']}", '--model_version=seedance2.0fast', '--duration=15', '--ratio=9:16', '--video_resolution=720p', '--poll=120']
            audio_ref = state['video'].get('audio_reference', '').strip()
            if audio_ref:
                args.extend(['--audio', audio_ref])
        else:
            args = [resolve_dreamina_bin(), 'frames2video', f'--first={first_path}', f'--last={last_path}', f"--prompt={state['input']['video_prompt']}", '--model_version=seedance2.0fast', '--duration=15', '--video_resolution=720p', '--poll=120']
        video_res = run_args(args)
        if video_res.returncode != 0:
            raise RuntimeError(video_res.stderr or video_res.stdout)
        (folder / 'video_result.json').write_text(video_res.stdout, encoding='utf-8')
        video_parsed = parse_result_json(video_res.stdout)
        ensure_dreamina_not_failed(video_parsed, '视频生成失败')
        video_submit_id = extract_submit_id(video_parsed)
        state['video_submit_id'] = video_submit_id or ''
        state['status'] = 'video_queued'
        write_status(job_id, state)
        if not video_submit_id:
            if not await finalize_video_if_available(job_id, state, folder):
                raise RuntimeError('未拿到视频 submit_id')
        else:
            await poll_video_until_ready(job_id, state, folder, video_submit_id)
    except Exception as exc:
        state['status'] = 'failed'
        state['error'] = str(exc)
        write_status(job_id, state)


def run_process_job_sync(job_id: str) -> None:
    asyncio.run(process_job(job_id))


def should_resume_job(state: dict[str, Any]) -> bool:
    return (
        state.get('task_type') == 'jimeng'
        and state.get('status') in {'video_queued', 'video_querying'}
        and bool(state.get('video_submit_id'))
    )


@app.on_event('startup')
async def resume_interrupted_jobs() -> None:
    for folder in RUNS_DIR.glob('*'):
        p = folder / 'status.json'
        if not p.exists():
            continue
        try:
            state = json.loads(p.read_text(encoding='utf-8'))
        except Exception:
            continue
        if should_resume_job(state):
            asyncio.create_task(asyncio.to_thread(run_process_job_sync, str(state['id'])))


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
        'timeline': JIMENG_TIMELINE,
        'timelines': {
            'jimeng': JIMENG_TIMELINE,
            'material': MATERIAL_TIMELINE,
        },
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
def create_job(
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    task_type: str = Form('jimeng'),
    first_prompt: str = Form(''),
    last_prompt: str = Form(''),
    video_prompt: str = Form(''),
    video_mode: str = Form('frames2video'),
    audio_reference: str = Form(''),
    post_mode: str = Form('auto'),
    title_card_text: str = Form(''),
    publish_title: str = Form(''),
    publish_description: str = Form(''),
    publish_cover: str = Form('auto'),
    auto_publish: str = Form(''),
    library: str = Form(''),
    clips: str = Form(''),
    stitch_mode: str = Form('concat'),
    topic: str = Form(''),
    target_duration_sec: str = Form('15'),
    material_category: str = Form('auto'),
    narration_tone: str = Form(''),
    voice_profile: str = Form('calm_female'),
    narration_text: str = Form(''),
    bgm_path: str = Form(''),
    enable_natural_voiceover: str = Form('1'),
    narration_style: str = Form('documentary'),
    subtitle_style: str = Form('douyin_bold'),
) -> JSONResponse:
    job_id = time.strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:6]
    task_type = task_type if task_type in {'jimeng', 'material'} else 'jimeng'
    base = {
        'id': job_id,
        'title': title,
        'task_type': task_type,
        'status': 'submitted',
        'error': '',
        'output': '',
        'created_at': time.time(),
        'updated_at': time.time(),
        'post': {
            'mode': post_mode,
            'title_card_text': title_card_text,
            'enable_natural_voiceover': enable_natural_voiceover == '1',
        },
        'publish': {
            'title': publish_title,
            'description': publish_description,
            'cover': publish_cover if publish_cover in {'auto', 'first', 'last'} else 'auto',
            'auto_publish': auto_publish == '1',
        },
    }
    if task_type == 'material':
        if not library.strip():
            raise HTTPException(status_code=400, detail='素材任务必须选择 library')
        try:
            parsed_clips = json.loads(clips) if clips else []
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail='clips 不是合法 JSON')
        if not isinstance(parsed_clips, list) or not parsed_clips:
            raise HTTPException(status_code=400, detail='至少需要一个片段')
        try:
            dur = float(target_duration_sec)
        except ValueError:
            dur = 15.0
        category = material_category if material_category in MATERIAL_CATEGORY_PRESETS else 'auto'
        preset = material_category_preset(category)
        voice = voice_profile if voice_profile in MATERIAL_VOICE_PROFILES else preset.get('voice_profile', 'calm_female')
        allowed_styles = {'documentary', 'emotional', 'explain', 'opinion'}
        material_style = narration_style if narration_style in allowed_styles else preset.get('narration_style', 'documentary')
        base['post']['narration_style'] = material_style
        base['input'] = {
            'library': library.strip(),
            'stitch_mode': stitch_mode if stitch_mode in {'concat', 'frames2video'} else 'concat',
            'topic': topic.strip(),
            'clips': parsed_clips,
            'target_duration_sec': dur,
            'material_category': category,
            'narration_tone': narration_tone.strip() or preset.get('tone', ''),
            'voice_profile': voice,
            'narration_style': material_style,
        }
        base['post']['material_category'] = category
        base['post']['narration_tone'] = narration_tone.strip() or preset.get('tone', '')
        base['post']['voice_profile'] = voice
        base['post']['subtitle_style'] = subtitle_style if subtitle_style in {'cinematic_white', 'douyin_bold', 'soft_minimal'} else 'douyin_bold'
        if narration_text.strip():
            base['post']['narration_text'] = narration_text.strip()
        if bgm_path.strip():
            base['post']['bgm_path'] = bgm_path.strip()
    else:
        if not first_prompt or not last_prompt or not video_prompt:
            raise HTTPException(status_code=400, detail='即梦任务必须提供首帧/尾帧/视频提示词')
        base['input'] = {
            'first_prompt': first_prompt,
            'last_prompt': last_prompt,
            'video_prompt': video_prompt,
            'bgm_path': bgm_path.strip(),
        }
        base['video'] = {
            'mode': video_mode,
            'audio_reference': audio_reference,
        }
    write_status(job_id, base)
    background_tasks.add_task(run_process_job_sync, job_id)
    return JSONResponse(base)


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
    background_tasks.add_task(run_process_job_sync, job_id)
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
        'publish_description': f'一条关于「{topic}」的 15 秒短片。 #{topic} #ClawLink #电影感短片 #AI短片',
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


# ============================================================
# 素材库 API
# ============================================================

class MaterialClipSelection(BaseModel):
    file: str
    reason: str = ''


class MaterialSelection(BaseModel):
    clips: list[MaterialClipSelection]
    suggested_title: str = ''
    suggested_description: str = ''
    suggested_tags: list[str] = Field(default_factory=list)
    title_card_text: str = ''
    narration_text: str = ''
    suggested_post_mode: str = ''
    narration_tone: str = ''
    voice_profile: str = ''
    narration_style: str = ''


MATERIAL_SYSTEM_PROMPT = """你是一位短视频剪辑师，服务于一个「素材库拼接」工作流。

工作流会从一个本地素材库里挑出若干个已有的视频片段，按你给的顺序把它们直接拼成一条约 {target}s 的 9:16 竖屏短片。

任务：结合给定的「主题」「内容类目预设」和素材库清单（每条含文件名、时长、可选标签），挑出最合适的一组片段并排好顺序，使得拼接后的视频在情绪/节奏/视觉上连贯、围绕主题、避免重复。同时为成片生成后处理策略、烧录字幕/旁白文案、语气和音色。

硬约束：
- 只能从清单里挑，不能新增任何文件名；file 字段必须与清单里的 file 完全一致（大小写、扩展名严格相同）；
- 总时长尽可能接近 {target}s（±30% 可接受），不要超过 {target}s 的 1.5 倍；
- 至少挑 2 段，最多不超过清单长度；
- 同时产出一个适合抖音的标题（20-30 字）、描述（含 2-4 个 # 话题）、标签数组（3-6 个）；
- 如果内容类目更偏信息/讲解/科教/观点/盘点，suggested_post_mode 必须为 narrated，并生成 12-45 秒内可读完的 narration_text；
- 如果内容类目更偏纯氛围/美学，suggested_post_mode 可为 title_card，并生成一句 title_card_text；
- narration_text 要能直接作为旁白朗读，也要能切成字幕，不要写舞台说明、括号、镜头指令；
- voice_profile 只能从 calm_female / warm_female / bright_female / steady_male / clear_male / elder_male 中选择；
- narration_style 只能从 documentary / emotional / explain / opinion 中选择，按内容类目决定旁白节奏；
- 所有字段用简体中文；
- 只返回 JSON 对象，不要任何解释或 markdown。

输出格式：
{{
  "clips": [{{"file": "01-xxx.mp4", "reason": "承担情绪开场"}}, ...],
  "suggested_title": "...",
  "suggested_description": "...",
  "suggested_tags": ["...", "..."],
  "title_card_text": "...",
  "narration_text": "...",
  "suggested_post_mode": "visual_only | title_card | narrated",
  "narration_tone": "...",
  "voice_profile": "calm_female",
  "narration_style": "documentary"
}}"""


def _trim_manifest_for_llm(manifest: dict[str, Any]) -> dict[str, Any]:
    clips = []
    for c in manifest.get('clips') or []:
        clips.append({
            'file': c.get('file'),
            'duration_sec': c.get('duration_sec'),
            'tags': c.get('tags') or [],
        })
    return {
        'name': manifest.get('name'),
        'library_meta': manifest.get('library_meta') or {},
        'total_duration_sec': manifest.get('total_duration_sec'),
        'clips': clips,
    }


def generate_material_selection_with_llm(
    manifest: dict[str, Any],
    topic: str,
    target_duration_sec: float,
    material_category: str = 'auto',
    narration_tone: str = '',
    voice_profile: str = '',
) -> dict[str, Any] | None:
    if not OPENAI_API_KEY:
        return None
    try:
        from openai import OpenAI
    except ImportError:
        return None
    try:
        client = OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL, timeout=120.0)
        trimmed = _trim_manifest_for_llm(manifest)
        preset = material_category_preset(material_category)
        voice = voice_profile if voice_profile in MATERIAL_VOICE_PROFILES else preset.get('voice_profile', 'calm_female')
        tone = narration_tone.strip() or preset.get('tone', '')
        preset_payload = {
            'category': material_category,
            'label': preset.get('label'),
            'default_post_mode': preset.get('post_mode'),
            'tone': tone,
            'voice_profile': voice,
            'narration_style': preset.get('narration_style', 'documentary'),
            'script_rule': preset.get('script_rule'),
        }
        merged = (
            MATERIAL_SYSTEM_PROMPT.format(target=int(target_duration_sec))
            + '\n\n主题：' + topic
            + '\n\n内容类目预设（JSON）：\n'
            + json.dumps(preset_payload, ensure_ascii=False)
            + '\n\n素材清单（JSON）：\n'
            + json.dumps(trimmed, ensure_ascii=False)
            + '\n\n请只返回上述格式的 JSON 对象。'
        )
        messages = [{'role': 'user', 'content': merged}]
        try:
            res = client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=messages,
                response_format={'type': 'json_object'},
            )
        except Exception:
            res = client.chat.completions.create(model=OPENAI_MODEL, messages=messages)
        content = res.choices[0].message.content if res.choices else ''
        raw = _extract_json_object(content or '')
        if not isinstance(raw, dict):
            return None
        try:
            parsed = MaterialSelection(**raw)
        except Exception:
            return None
        valid_files = {c['file'] for c in manifest.get('clips') or []}
        picked: list[dict[str, Any]] = []
        for order, item in enumerate(parsed.clips, start=1):
            if item.file not in valid_files:
                continue
            # pull duration from manifest
            dur = 0.0
            for c in manifest.get('clips') or []:
                if c.get('file') == item.file:
                    dur = float(c.get('duration_sec') or 0)
                    break
            picked.append({
                'file': item.file,
                'relpath': item.file,
                'duration_sec': dur,
                'reason': item.reason,
                'order': order,
            })
        if not picked:
            return None
        allowed_modes = {'visual_only', 'title_card', 'narrated'}
        mode = parsed.suggested_post_mode if parsed.suggested_post_mode in allowed_modes else preset.get('post_mode', 'auto')
        if mode == 'auto':
            mode = 'narrated' if material_category in {'science', 'explain', 'opinion', 'list'} else 'title_card'
        parsed_voice = parsed.voice_profile if parsed.voice_profile in MATERIAL_VOICE_PROFILES else voice
        allowed_styles = {'documentary', 'emotional', 'explain', 'opinion'}
        parsed_style = parsed.narration_style if parsed.narration_style in allowed_styles else preset.get('narration_style', 'documentary')
        narration = (parsed.narration_text or '').strip()
        title_card = (parsed.title_card_text or '').strip()
        if mode == 'narrated' and not narration:
            narration = build_material_fallback_narration(topic, material_category)
        if not title_card:
            title_card = build_material_title_card(topic, material_category)
        return {
            'clips': picked,
            'suggested_title': parsed.suggested_title,
            'suggested_description': parsed.suggested_description,
            'suggested_tags': parsed.suggested_tags,
            'title_card_text': title_card,
            'narration_text': narration,
            'suggested_post_mode': mode,
            'narration_tone': (parsed.narration_tone or tone).strip(),
            'voice_profile': parsed_voice,
            'narration_style': parsed_style,
            'material_category': material_category,
        }
    except Exception:
        return None


@app.get('/api/material-libraries')
def list_material_libraries() -> JSONResponse:
    return JSONResponse(material_pipeline.list_libraries())


@app.post('/api/material-libraries/open')
def open_material_library(library: str = Form('')) -> JSONResponse:
    root = material_pipeline.MATERIAL_ROOT.resolve()
    target = root
    library = library.strip()
    if library:
        target = (root / library).resolve()
        try:
            target.relative_to(root)
        except ValueError:
            raise HTTPException(status_code=400, detail='非法素材库路径')
    if not target.exists() or not target.is_dir():
        raise HTTPException(status_code=404, detail=f'素材库不存在: {library or root}')
    try:
        subprocess.Popen(['open', str(target)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'打开失败: {exc}')
    return JSONResponse({'ok': True, 'path': str(target)})


@app.get('/api/material-libraries/{name}/manifest')
def get_material_manifest(name: str) -> JSONResponse:
    lib_path = material_pipeline.MATERIAL_ROOT / name
    if not lib_path.exists() or not lib_path.is_dir():
        raise HTTPException(status_code=404, detail=f'素材库不存在: {name}')
    try:
        manifest = material_pipeline.scan_library(lib_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'扫描失败: {exc}')
    return JSONResponse(manifest)


@app.post('/api/generate-material')
async def generate_material(
    library: str = Form(...),
    topic: str = Form(...),
    stitch_mode: str = Form('concat'),
    target_duration_sec: str = Form('15'),
    material_category: str = Form('auto'),
    narration_tone: str = Form(''),
    voice_profile: str = Form('calm_female'),
) -> JSONResponse:
    library = library.strip()
    topic = topic.strip()
    if not library:
        raise HTTPException(status_code=400, detail='素材库不能为空')
    lib_path = material_pipeline.MATERIAL_ROOT / library
    if not lib_path.exists() or not lib_path.is_dir():
        raise HTTPException(status_code=404, detail=f'素材库不存在: {library}')
    try:
        target = float(target_duration_sec)
    except ValueError:
        target = 15.0
    category = material_category if material_category in MATERIAL_CATEGORY_PRESETS else 'auto'
    preset = material_category_preset(category)
    voice = voice_profile if voice_profile in MATERIAL_VOICE_PROFILES else preset.get('voice_profile', 'calm_female')
    tone = narration_tone.strip() or preset.get('tone', '')
    manifest = await asyncio.to_thread(material_pipeline.scan_library, lib_path)
    if not manifest.get('clips'):
        raise HTTPException(status_code=400, detail='素材库里还没有片段')

    engine = OPENAI_MODEL
    data = None
    if topic:
        data = await asyncio.to_thread(
            generate_material_selection_with_llm, manifest, topic, target, category, tone, voice
        )
    if data is None:
        data = material_pipeline.material_selection_fallback(manifest, target)
        mode = preset.get('post_mode') or 'auto'
        if mode == 'auto':
            mode = 'narrated' if category in {'science', 'explain', 'opinion', 'list'} else 'title_card'
        data.update({
            'title_card_text': build_material_title_card(topic or library, category),
            'narration_text': build_material_fallback_narration(topic or library, category) if mode == 'narrated' else '',
            'suggested_post_mode': mode,
            'narration_tone': tone,
            'voice_profile': voice,
            'narration_style': preset.get('narration_style', 'documentary'),
            'material_category': category,
        })
        engine = 'fallback'
    data['library'] = library
    data['topic'] = topic
    data['stitch_mode'] = stitch_mode
    data['target_duration_sec'] = target
    data['material_category'] = data.get('material_category') or category
    data['narration_tone'] = data.get('narration_tone') or tone
    data['voice_profile'] = data.get('voice_profile') or voice
    data['narration_style'] = data.get('narration_style') or preset.get('narration_style', 'documentary')
    data['engine'] = engine
    return JSONResponse(data)
