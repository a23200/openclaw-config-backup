from __future__ import annotations

import os
from pathlib import Path

from openai import OpenAI


ENV_FILE_CANDIDATES = [
    Path('/Users/mac/.openclaw/workspace/.env.local'),
    Path(__file__).resolve().parents[2] / '.env.local',
    Path(__file__).resolve().parents[2] / '.env',
]
DEFAULT_BASE_URL = 'https://api.codexzh.com/v1'
DEFAULT_MODEL = 'gpt-4o-mini-tts'
DEFAULT_VOICE = 'nova'


def _load_env_files() -> None:
    for env_file in ENV_FILE_CANDIDATES:
        if not env_file.exists():
            continue
        for raw_line in env_file.read_text(encoding='utf-8', errors='ignore').splitlines():
            line = raw_line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def _env(name: str, default: str = '') -> str:
    _load_env_files()
    value = os.environ.get(name, '').strip()
    return value or default


def _resolve_client() -> OpenAI:
    api_key = _env('OPENAI_API_KEY')
    if not api_key:
        raise RuntimeError('缺少 OPENAI_API_KEY，无法调用高质量 TTS')
    base_url = _env('OPENAI_BASE_URL', DEFAULT_BASE_URL)
    return OpenAI(api_key=api_key, base_url=base_url)


def generate_openai_tts(text: str, output_path: Path, voice: str = DEFAULT_VOICE, model: str | None = None) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    use_model = model or _env('OPENAI_TTS_MODEL', DEFAULT_MODEL)
    client = _resolve_client()
    with client.audio.speech.with_streaming_response.create(
        model=use_model,
        voice=voice,
        input=text,
        response_format='mp3',
    ) as response:
        response.stream_to_file(str(output_path))
    if not output_path.exists() or output_path.stat().st_size == 0:
        raise RuntimeError('TTS 返回成功但音频文件为空')
    return output_path
