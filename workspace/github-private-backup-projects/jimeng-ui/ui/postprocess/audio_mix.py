from __future__ import annotations

from pathlib import Path
from typing import Callable


MergeAudioVideoOnly = Callable[[Path, Path, Path], object]
RunArgs = Callable[[list[str]], object]


def _clamp_audio_speed(speed: float) -> float:
    return max(0.5, min(float(speed or 1.0), 2.0))


def _voice_filter_chain(speed: float = 1.0, gain: float = 1.0) -> str:
    filters = [
        'silenceremove=start_periods=1:start_duration=0.05:start_threshold=-50dB',
    ]
    normalized_speed = _clamp_audio_speed(speed)
    if abs(normalized_speed - 1.0) > 0.01:
        filters.append(f'atempo={normalized_speed:.3f}')
    filters.extend([
        'loudnorm=I=-16:TP=-1.5:LRA=11',
        'acompressor=threshold=-18dB:ratio=2.5:attack=12:release=160:makeup=1.5',
        f'volume={float(gain or 1.0):.3f}',
        'alimiter=limit=0.96',
    ])
    return ','.join(filters)


def normalize_voiceover(
    narration_path: Path,
    folder: Path,
    run_args: RunArgs,
    *,
    speed: float = 1.0,
    gain: float = 1.0,
) -> tuple[Path, object]:
    normalized_path = folder / 'narration_normalized.mp3'
    result = run_args([
        'ffmpeg', '-y',
        '-i', str(narration_path),
        '-af', _voice_filter_chain(speed=speed, gain=gain),
        '-c:a', 'libmp3lame',
        '-b:a', '192k',
        str(normalized_path),
    ])
    return normalized_path, result


def _build_duck_filter(target_duration: float, voice_gain: float, bgm_volume: float, use_sidechain: bool) -> str:
    duration = max(float(target_duration or 0), 0.1)
    voice = f'[0:a]volume={voice_gain:.3f},apad=whole_dur={duration:.3f},atrim=0:{duration:.3f},asetpts=N/SR/TB[voice]'
    bgm = f'[1:a]volume={bgm_volume:.3f},atrim=0:{duration:.3f},asetpts=N/SR/TB[bgm]'
    if use_sidechain:
        duck = (
            '[bgm][voice]sidechaincompress=threshold=0.025:ratio=9:attack=30:'
            'release=700:makeup=1[ducked]'
        )
    else:
        duck = '[bgm]volume=0.45[ducked]'
    mix = (
        '[voice][ducked]amix=inputs=2:duration=longest:dropout_transition=2,'
        'loudnorm=I=-15:TP=-1.2:LRA=11,alimiter=limit=0.98[aout]'
    )
    return ';'.join([voice, bgm, duck, mix])


def duck_bgm_under_voiceover(
    folder: Path,
    narration_path: Path,
    bgm_path: str,
    run_args: RunArgs,
    *,
    target_duration: float,
    voice_gain: float = 1.0,
    bgm_volume: float = 0.28,
) -> tuple[Path | None, object | None]:
    bgm = Path(bgm_path).expanduser()
    if not bgm.exists():
        return None, None
    mixed_path = folder / 'mixed_audio.mp3'
    sidechain_args = [
        'ffmpeg', '-y',
        '-i', str(narration_path),
        '-stream_loop', '-1',
        '-i', str(bgm),
        '-t', f'{max(float(target_duration or 0), 0.1):.3f}',
        '-filter_complex', _build_duck_filter(target_duration, voice_gain, bgm_volume, use_sidechain=True),
        '-map', '[aout]',
        '-c:a', 'libmp3lame',
        '-b:a', '192k',
        str(mixed_path),
    ]
    result = run_args(sidechain_args)
    if getattr(result, 'returncode', 1) == 0 and mixed_path.exists():
        return mixed_path, result

    fallback_path = folder / 'mixed_audio.mp3'
    fallback_result = run_args([
        'ffmpeg', '-y',
        '-i', str(narration_path),
        '-stream_loop', '-1',
        '-i', str(bgm),
        '-t', f'{max(float(target_duration or 0), 0.1):.3f}',
        '-filter_complex', _build_duck_filter(target_duration, voice_gain, bgm_volume, use_sidechain=False),
        '-map', '[aout]',
        '-c:a', 'libmp3lame',
        '-b:a', '192k',
        str(fallback_path),
    ])
    return fallback_path, fallback_result


def mix_narration_with_bgm(
    folder: Path,
    narration_path: Path,
    bgm_path: str,
    run_args: RunArgs,
    *,
    target_duration: float = 0,
    voice_gain: float = 1.0,
    bgm_volume: float = 0.28,
) -> tuple[Path | None, object | None]:
    if target_duration > 0:
        return duck_bgm_under_voiceover(
            folder,
            narration_path,
            bgm_path,
            run_args,
            target_duration=target_duration,
            voice_gain=voice_gain,
            bgm_volume=bgm_volume,
        )
    bgm = Path(bgm_path).expanduser()
    if not bgm.exists():
        return None, None
    mixed_path = folder / 'mixed_audio.mp3'
    result = run_args([
        'ffmpeg', '-y',
        '-i', str(narration_path),
        '-i', str(bgm),
        '-filter_complex',
        '[1:a]volume=0.18[bgm];'
        '[0:a][bgm]amix=inputs=2:duration=longest:dropout_transition=2,'
        'loudnorm=I=-15:TP=-1.2:LRA=11,alimiter=limit=0.98[aout]',
        '-map', '[aout]',
        '-c:a', 'libmp3lame',
        '-b:a', '192k',
        str(mixed_path),
    ])
    return mixed_path, result


def attach_narration_to_video(final_path: Path, audio_path: Path, folder: Path, merge_audio_video_only: MergeAudioVideoOnly) -> tuple[Path, object]:
    narrated_path = folder / 'final_with_audio.mp4'
    result = merge_audio_video_only(final_path, audio_path, narrated_path)
    return narrated_path, result
