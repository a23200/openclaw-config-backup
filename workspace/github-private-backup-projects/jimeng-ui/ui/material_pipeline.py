"""Material library pipeline.

Handles the non-Jimeng task type: pick clips from ~/Movies/素材/<lib>/ and
stitch them together — either directly (ffmpeg concat) or by regenerating
motion per clip via dreamina frames2video.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any

MATERIAL_ROOT = Path.home() / 'Movies' / '素材'
SUPPORTED_SUFFIXES = {'.mp4', '.mov', '.webm', '.m4v'}
MANIFEST_CACHE_NAME = '.manifest.json'
LIBRARY_META_NAME = 'library.json'


def _is_hidden(p: Path) -> bool:
    return p.name.startswith('.') or p.name.startswith('_')


def _run(args: list[str], timeout: float = 120) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout)


def _ffprobe_duration(path: Path) -> float:
    res = _run(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
         '-of', 'default=nw=1:nk=1', str(path)],
        timeout=20,
    )
    if res.returncode != 0:
        return 0.0
    try:
        return float((res.stdout or '0').strip())
    except ValueError:
        return 0.0


def _ffprobe_video_stream(path: Path) -> dict[str, Any]:
    res = _run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
         '-show_entries', 'stream=width,height,avg_frame_rate,codec_name',
         '-of', 'json', str(path)],
        timeout=20,
    )
    if res.returncode != 0:
        return {}
    try:
        data = json.loads(res.stdout or '{}')
    except json.JSONDecodeError:
        return {}
    streams = data.get('streams') or []
    return streams[0] if streams else {}


def _parse_fps(fps_str: str) -> float:
    if not fps_str:
        return 0.0
    if '/' in fps_str:
        num, den = fps_str.split('/', 1)
        try:
            n, d = float(num), float(den)
            return n / d if d else 0.0
        except ValueError:
            return 0.0
    try:
        return float(fps_str)
    except ValueError:
        return 0.0


def _read_tags(stem_path: Path) -> list[str]:
    txt = stem_path.with_suffix('.txt')
    if not txt.exists():
        return []
    try:
        raw = txt.read_text(encoding='utf-8').strip()
    except Exception:
        return []
    return [t.strip() for t in raw.replace('\n', ',').split(',') if t.strip()]


def _read_library_meta(lib_path: Path) -> dict[str, Any]:
    meta_file = lib_path / LIBRARY_META_NAME
    if not meta_file.exists():
        return {}
    try:
        return json.loads(meta_file.read_text(encoding='utf-8'))
    except Exception:
        return {}


def _fingerprint(clips: list[Path]) -> str:
    """Stable fingerprint of a clip set — changes when files are added,
    removed, renamed, or their size/mtime changes."""
    parts = []
    for p in sorted(clips):
        try:
            st = p.stat()
            parts.append(f'{p.name}:{int(st.st_mtime)}:{st.st_size}')
        except FileNotFoundError:
            continue
    return hashlib.sha1('\n'.join(parts).encode('utf-8')).hexdigest()


def list_libraries() -> list[dict[str, Any]]:
    """One entry per direct subdirectory of MATERIAL_ROOT."""
    if not MATERIAL_ROOT.exists():
        return []
    out: list[dict[str, Any]] = []
    for child in sorted(MATERIAL_ROOT.iterdir()):
        if not child.is_dir() or _is_hidden(child):
            continue
        clips = [p for p in child.iterdir() if p.is_file() and p.suffix.lower() in SUPPORTED_SUFFIXES and not _is_hidden(p)]
        total_dur = 0.0
        cache = child / MANIFEST_CACHE_NAME
        if cache.exists():
            try:
                cached = json.loads(cache.read_text(encoding='utf-8'))
                if cached.get('fingerprint') == _fingerprint(clips):
                    total_dur = float(cached.get('total_duration_sec') or 0.0)
            except Exception:
                total_dur = 0.0
        if total_dur <= 0 and clips:
            total_dur = sum(_ffprobe_duration(p) for p in clips)
        out.append({
            'name': child.name,
            'clip_count': len(clips),
            'total_duration_sec': round(total_dur, 2),
        })
    return out


def scan_library(lib_path: Path) -> dict[str, Any]:
    """Build the manifest for a single library, using .manifest.json cache
    when the fingerprint matches."""
    if not lib_path.exists() or not lib_path.is_dir():
        raise FileNotFoundError(f'素材库不存在: {lib_path}')
    clips = sorted(
        [p for p in lib_path.iterdir() if p.is_file() and p.suffix.lower() in SUPPORTED_SUFFIXES and not _is_hidden(p)],
        key=lambda p: p.name,
    )
    fp = _fingerprint(clips)
    cache = lib_path / MANIFEST_CACHE_NAME
    if cache.exists():
        try:
            cached = json.loads(cache.read_text(encoding='utf-8'))
            if cached.get('fingerprint') == fp:
                return cached
        except Exception:
            pass

    library_meta = _read_library_meta(lib_path)
    clip_entries: list[dict[str, Any]] = []
    total = 0.0
    for p in clips:
        dur = _ffprobe_duration(p)
        vs = _ffprobe_video_stream(p)
        width = int(vs.get('width') or 0)
        height = int(vs.get('height') or 0)
        fps = _parse_fps(vs.get('avg_frame_rate') or '')
        clip_entries.append({
            'file': p.name,
            'relpath': p.name,
            'duration_sec': round(dur, 2),
            'tags': _read_tags(p),
            'resolution': f'{width}x{height}' if width and height else '',
            'fps': round(fps, 2) if fps else 0,
            'codec': vs.get('codec_name') or '',
        })
        total += dur

    manifest = {
        'name': lib_path.name,
        'library_meta': library_meta,
        'clip_count': len(clip_entries),
        'total_duration_sec': round(total, 2),
        'clips': clip_entries,
        'fingerprint': fp,
        'scanned_at': time.time(),
    }
    try:
        cache.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    except Exception:
        pass
    return manifest


def material_selection_fallback(manifest: dict[str, Any], target_duration_sec: float) -> dict[str, Any]:
    """Greedy fallback: take clips in manifest order until target reached."""
    clips = manifest.get('clips') or []
    picked: list[dict[str, Any]] = []
    acc = 0.0
    for idx, c in enumerate(clips):
        picked.append({
            'file': c['file'],
            'relpath': c.get('relpath') or c['file'],
            'duration_sec': c['duration_sec'],
            'reason': '顺序贪心兜底',
            'order': len(picked) + 1,
        })
        acc += float(c.get('duration_sec') or 0)
        if acc >= target_duration_sec:
            break
    topic = manifest.get('name', '素材合集')
    return {
        'clips': picked,
        'suggested_title': f'{topic} · {round(acc, 1)}s',
        'suggested_description': f'{topic} 精选片段合集 #{topic} #ClawLink #AI短片',
        'suggested_tags': [topic, 'ClawLink', 'AI短片'],
    }


def concat_clips(clips: list[Path], out_mp4: Path) -> None:
    """Stitch clips into one mp4. First try stream-copy concat (fast, no
    quality loss); if the clips have incompatible codecs/resolutions fall
    back to a transcode pass."""
    if not clips:
        raise ValueError('没有可拼接的片段')
    out_mp4.parent.mkdir(parents=True, exist_ok=True)
    list_file = out_mp4.parent / 'concat_list.txt'
    list_file.write_text(
        '\n'.join(f"file '{p.resolve()}'" for p in clips) + '\n',
        encoding='utf-8',
    )

    copy_res = _run(
        ['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', str(list_file),
         '-c', 'copy', str(out_mp4)],
        timeout=600,
    )
    if copy_res.returncode == 0 and out_mp4.exists() and out_mp4.stat().st_size > 0:
        return

    # transcode pass — normalize to 1080x1920 / 30fps h264 + aac
    args: list[str] = ['ffmpeg', '-y']
    for p in clips:
        args.extend(['-i', str(p)])
    parts: list[str] = []
    labels: list[str] = []
    for i in range(len(clips)):
        parts.append(
            f'[{i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,'
            f'pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p[v{i}];'
            f'[{i}:a]aresample=async=1:first_pts=0,aformat=channel_layouts=stereo:sample_rates=48000[a{i}]'
        )
        labels.append(f'[v{i}][a{i}]')
    filter_complex = ''.join(parts) + ''.join(labels) + f'concat=n={len(clips)}:v=1:a=1[v][a]'
    args.extend([
        '-filter_complex', filter_complex,
        '-map', '[v]', '-map', '[a]',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart',
        str(out_mp4),
    ])
    trans_res = _run(args, timeout=1200)
    if trans_res.returncode != 0 or not out_mp4.exists():
        raise RuntimeError('ffmpeg concat 失败: ' + (trans_res.stderr or trans_res.stdout)[:800])


def extract_first_frame(clip: Path, out_png: Path) -> None:
    out_png.parent.mkdir(parents=True, exist_ok=True)
    res = _run(
        ['ffmpeg', '-y', '-i', str(clip), '-vframes', '1', '-q:v', '2', str(out_png)],
        timeout=60,
    )
    if res.returncode != 0 or not out_png.exists():
        raise RuntimeError(f'提取首帧失败 {clip.name}: ' + (res.stderr or res.stdout)[:400])


async def run_frames2video(
    clip_frames: list[tuple[Path, Path, float]],
    out_dir: Path,
    dreamina_bin: str,
    prompt_template: str,
    log_path: Path | None = None,
) -> list[Path]:
    """For each (first_frame, original_clip, duration), call dreamina
    frames2video and return generated mp4 paths in order. On per-clip
    failure, fall back to the original clip so the pipeline keeps moving."""
    out_dir.mkdir(parents=True, exist_ok=True)
    outputs: list[Path] = []
    for idx, (frame, origin, dur) in enumerate(clip_frames, start=1):
        sub = out_dir / f'{idx:02d}'
        sub.mkdir(parents=True, exist_ok=True)
        duration_arg = max(3, min(10, int(round(dur)) or 5))
        prompt = prompt_template.strip() or '保持原片节奏，自然运镜过渡'
        args = [
            dreamina_bin, 'frames2video',
            f'--first={frame}',
            f'--prompt={prompt}',
            '--model_version=seedance2.0fast',
            f'--duration={duration_arg}',
            '--video_resolution=720p',
            '--poll=120',
            f'--download_dir={sub}',
        ]
        try:
            proc = await asyncio.to_thread(_run, args, 900)
            stdout = proc.stdout or ''
            stderr = proc.stderr or ''
        except Exception as exc:
            stdout, stderr = '', f'{type(exc).__name__}: {exc}'
            proc = None
        if log_path:
            try:
                with log_path.open('a', encoding='utf-8') as f:
                    f.write(f'\n=== clip {idx} ({origin.name}) ===\n{stdout}\n{stderr}\n')
            except Exception:
                pass
        # pick newest mp4 in sub dir
        mp4s = [p for p in sub.glob('*.mp4') if p.is_file()]
        if mp4s and proc is not None and proc.returncode == 0:
            mp4 = sorted(mp4s, key=lambda p: p.stat().st_mtime)[-1]
            outputs.append(mp4)
        else:
            # fall back to original clip — copy into sub for uniform layout
            fallback = sub / f'fallback_{origin.name}'
            try:
                shutil.copy2(origin, fallback)
                outputs.append(fallback)
            except Exception:
                outputs.append(origin)
    return outputs


async def run_material_pipeline(
    job_id: str,
    state: dict[str, Any],
    folder: Path,
    write_status,
    dreamina_bin: str,
) -> Path:
    """End-to-end material pipeline. Returns the final.mp4 path.

    `write_status` is passed in so we don't create a circular import with
    jimeng_ui_app.
    """
    inp = state.get('input') or {}
    library_name = inp.get('library') or ''
    stitch_mode = inp.get('stitch_mode') or 'concat'
    clips_meta = inp.get('clips') or []
    if not library_name or not clips_meta:
        raise RuntimeError('素材任务缺少 library 或 clips')

    lib_path = MATERIAL_ROOT / library_name
    clip_paths: list[Path] = []
    for c in clips_meta:
        rel = c.get('relpath') or c.get('file')
        if not rel:
            raise RuntimeError(f'片段记录缺少文件名: {c}')
        p = (lib_path / rel).resolve()
        if not p.exists():
            raise FileNotFoundError(f'片段不存在: {p}')
        clip_paths.append(p)

    # 1. stitching phase
    state['status'] = 'material_stitching'
    write_status(job_id, state)

    final_path = folder / 'final.mp4'

    if stitch_mode == 'frames2video':
        frames_dir = folder / 'frames'
        frames_dir.mkdir(parents=True, exist_ok=True)
        clip_frames: list[tuple[Path, Path, float]] = []
        for idx, clip in enumerate(clip_paths, start=1):
            frame_png = frames_dir / f'{idx:02d}_{clip.stem}.png'
            await asyncio.to_thread(extract_first_frame, clip, frame_png)
            dur = float(clips_meta[idx - 1].get('duration_sec') or _ffprobe_duration(clip))
            clip_frames.append((frame_png, clip, dur))

        state['status'] = 'material_frames2video_submitted'
        write_status(job_id, state)

        prompt_template = (inp.get('topic') or '') + ' 保持电影感与自然过渡'
        log_path = folder / 'video_query.log'

        state['status'] = 'material_frames2video_queued'
        write_status(job_id, state)

        generated = await run_frames2video(
            clip_frames=clip_frames,
            out_dir=folder / 'clips',
            dreamina_bin=dreamina_bin,
            prompt_template=prompt_template,
            log_path=log_path,
        )

        state['status'] = 'material_frames2video_ready'
        write_status(job_id, state)

        await asyncio.to_thread(concat_clips, generated, final_path)
    else:
        # plain ffmpeg concat
        await asyncio.to_thread(concat_clips, clip_paths, final_path)

    if not final_path.exists():
        raise RuntimeError('素材拼接失败：final.mp4 未生成')
    return final_path
