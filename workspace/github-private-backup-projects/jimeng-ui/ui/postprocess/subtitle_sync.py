from __future__ import annotations

import re
import shutil
from difflib import SequenceMatcher
from dataclasses import dataclass
from pathlib import Path
from typing import Callable


TranscribeWithWhisper = Callable[[Path, Path], object]
WriteSimpleSrt = Callable[[str, float, Path], None]
SrtToAss = Callable[..., None]


@dataclass
class SubtitleEntry:
    start: float
    end: float
    text: str


FILLER_PATTERN = re.compile(r'(嗯+|呃+|啊+|额+|就是|然后|这个|那个)[，,、\s]*(?=\1)')


def _format_srt_time(seconds: float) -> str:
    milliseconds_total = max(0, int(round(seconds * 1000)))
    hours = milliseconds_total // 3_600_000
    milliseconds_total %= 3_600_000
    minutes = milliseconds_total // 60_000
    milliseconds_total %= 60_000
    seconds_part = milliseconds_total // 1000
    milliseconds = milliseconds_total % 1000
    return f'{hours:02d}:{minutes:02d}:{seconds_part:02d},{milliseconds:03d}'


def _parse_srt_time(raw: str) -> float:
    hms, milliseconds = raw.strip().split(',', 1)
    hours, minutes, seconds = [int(part) for part in hms.split(':')]
    return hours * 3600 + minutes * 60 + seconds + int(milliseconds[:3]) / 1000.0


def parse_srt_entries(srt_path: Path) -> list[SubtitleEntry]:
    content = srt_path.read_text(encoding='utf-8').strip()
    if not content:
        return []
    entries: list[SubtitleEntry] = []
    for block in re.split(r'\n\s*\n', content):
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        timing_index = next((index for index, line in enumerate(lines) if '-->' in line), -1)
        if timing_index < 0 or timing_index >= len(lines) - 1:
            continue
        start_raw, end_raw = [part.strip() for part in lines[timing_index].split('-->', 1)]
        text = ' '.join(lines[timing_index + 1:]).strip()
        if not text:
            continue
        entries.append(SubtitleEntry(start=_parse_srt_time(start_raw), end=_parse_srt_time(end_raw), text=text))
    return entries


def _clean_caption_text(text: str) -> str:
    cleaned = re.sub(r'<[^>]+>', '', text)
    cleaned = re.sub(r'\[[^\]]+\]', '', cleaned)
    cleaned = re.sub(r'\s+', '', cleaned)
    cleaned = FILLER_PATTERN.sub('', cleaned)
    cleaned = re.sub(r'([。！？!?])\1+', r'\1', cleaned)
    cleaned = re.sub(r'[，,、]{2,}', '，', cleaned)
    return cleaned.strip('，,、。 ')


def _split_text_chunks(text: str, max_chars: int) -> list[str]:
    if len(text) <= max_chars:
        return [text]
    chunks: list[str] = []
    current = ''
    segments = [segment for segment in re.split(r'(?<=[。！？!?；;])', text) if segment]
    if len(segments) <= 1:
        segments = [text[start:start + max_chars] for start in range(0, len(text), max_chars)]
    for segment in segments:
        if len(segment) > max_chars:
            if current:
                chunks.append(current)
                current = ''
            chunks.extend(segment[start:start + max_chars] for start in range(0, len(segment), max_chars))
            continue
        trial = current + segment
        if current and len(trial) > max_chars:
            chunks.append(current)
            current = segment
        else:
            current = trial
    if current:
        chunks.append(current)
    return [chunk.strip('，,、 ') for chunk in chunks if chunk.strip('，,、 ')]


def _wrap_caption_lines(text: str, line_chars: int) -> str:
    if len(text) <= line_chars:
        return text
    chunks = [text[start:start + line_chars] for start in range(0, len(text), line_chars)]
    if len(chunks) <= 2:
        return '\n'.join(chunks)
    return '\n'.join([''.join(chunks[:-1]), chunks[-1]])


def _merge_short_entries(entries: list[SubtitleEntry], min_chars: int, max_chars: int) -> list[SubtitleEntry]:
    merged: list[SubtitleEntry] = []
    pending: SubtitleEntry | None = None
    for entry in entries:
        if pending is None:
            pending = entry
            continue
        combined_text = pending.text + entry.text
        gap = max(0.0, entry.start - pending.end)
        if (len(pending.text) < min_chars or pending.end - pending.start < 0.8) and len(combined_text) <= max_chars and gap <= 0.7:
            pending = SubtitleEntry(start=pending.start, end=entry.end, text=combined_text)
        else:
            merged.append(pending)
            pending = entry
    if pending is not None:
        merged.append(pending)
    return merged


def refine_subtitles(raw_srt_path: Path, output_srt_path: Path, *, max_chars: int = 22, line_chars: int = 14) -> Path:
    raw_entries = parse_srt_entries(raw_srt_path)
    cleaned_entries = [
        SubtitleEntry(start=entry.start, end=entry.end, text=cleaned)
        for entry in raw_entries
        if (cleaned := _clean_caption_text(entry.text))
    ]
    merged_entries = _merge_short_entries(cleaned_entries, min_chars=6, max_chars=max_chars)
    refined_entries: list[SubtitleEntry] = []
    for entry in merged_entries:
        chunks = _split_text_chunks(entry.text, max_chars=max_chars)
        if len(chunks) <= 1:
            refined_entries.append(SubtitleEntry(entry.start, entry.end, _wrap_caption_lines(entry.text, line_chars)))
            continue
        duration = max(0.45, (entry.end - entry.start) / len(chunks))
        current_start = entry.start
        for chunk_index, chunk in enumerate(chunks):
            current_end = entry.end if chunk_index == len(chunks) - 1 else min(entry.end, current_start + duration)
            refined_entries.append(SubtitleEntry(current_start, current_end, _wrap_caption_lines(chunk, line_chars)))
            current_start = current_end

    lines: list[str] = []
    for index, entry in enumerate(refined_entries, start=1):
        lines.append(
            f'{index}\n{_format_srt_time(entry.start)} --> {_format_srt_time(entry.end)}\n{entry.text}\n'
        )
    output_srt_path.write_text('\n'.join(lines), encoding='utf-8')
    return output_srt_path


def _caption_text_length(srt_path: Path) -> int:
    return sum(len(_clean_caption_text(entry.text)) for entry in parse_srt_entries(srt_path))


def _caption_text_joined(srt_path: Path) -> str:
    return ''.join(_clean_caption_text(entry.text) for entry in parse_srt_entries(srt_path))


def _whisper_result_is_usable(raw_srt_path: Path, narration_text: str) -> bool:
    expected_text = _clean_caption_text(narration_text)
    expected_length = len(expected_text)
    if expected_length <= 12:
        return raw_srt_path.exists() and _caption_text_length(raw_srt_path) > 0
    actual_text = _caption_text_joined(raw_srt_path)
    actual_length = len(actual_text)
    if actual_length < max(8, int(expected_length * 0.75)):
        return False
    similarity = SequenceMatcher(None, expected_text, actual_text).ratio()
    return similarity >= 0.6


def generate_synced_subtitles(
    narration_text: str,
    narration_path: Path,
    folder: Path,
    duration: float,
    transcribe_with_whisper: TranscribeWithWhisper,
    write_simple_srt: WriteSimpleSrt,
    srt_to_ass: SrtToAss,
    subtitle_theme: str = 'douyin_bold',
) -> tuple[Path, Path, Path, object]:
    raw_srt_path = folder / 'raw_subtitles.srt'
    srt_path = folder / 'subtitles.srt'
    ass_path = folder / 'subtitles.ass'
    whisper_res = transcribe_with_whisper(narration_path, folder)
    generated_srt = folder / f'{narration_path.stem}.srt'
    if getattr(whisper_res, 'returncode', 1) == 0 and generated_srt.exists():
        shutil.copy2(generated_srt, raw_srt_path)
        if not _whisper_result_is_usable(raw_srt_path, narration_text):
            write_simple_srt(narration_text, duration, raw_srt_path)
    else:
        write_simple_srt(narration_text, duration, raw_srt_path)
    refine_subtitles(raw_srt_path, srt_path)
    try:
        srt_to_ass(srt_path, ass_path, subtitle_theme)
    except TypeError:
        srt_to_ass(srt_path, ass_path)
    return raw_srt_path, srt_path, ass_path, whisper_res
