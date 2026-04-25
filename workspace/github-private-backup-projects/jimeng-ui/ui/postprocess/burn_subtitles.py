from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Callable


SubtitleBurnFilter = Callable[[], str | None]
BurnSubtitlesWithOverlay = Callable[[Path, Path, Path, Path, str], object]
BurnSubtitlesOnly = Callable[[Path, Path, Path], object]
SubtitleBurnErrorMessage = Callable[[str], str]


@dataclass(frozen=True)
class SubtitleTheme:
    label: str
    font_scale: float
    min_font_size: int
    stroke_width: int
    shadow_offset: int
    box_enabled: bool
    box_opacity: int
    margin_bottom_ratio: float
    max_width_ratio: float
    line_spacing: int
    fill_rgba: tuple[int, int, int, int]
    stroke_rgba: tuple[int, int, int, int]
    shadow_rgba: tuple[int, int, int, int]
    box_rgba: tuple[int, int, int, int]
    ass_font_size: int
    ass_outline: int
    ass_shadow: int
    ass_margin_v: int
    bold: bool = True


SUBTITLE_THEMES: dict[str, SubtitleTheme] = {
    'cinematic_white': SubtitleTheme(
        label='电影白字',
        font_scale=0.052,
        min_font_size=32,
        stroke_width=2,
        shadow_offset=3,
        box_enabled=False,
        box_opacity=0,
        margin_bottom_ratio=0.13,
        max_width_ratio=0.78,
        line_spacing=12,
        fill_rgba=(255, 255, 255, 255),
        stroke_rgba=(0, 0, 0, 210),
        shadow_rgba=(0, 0, 0, 110),
        box_rgba=(0, 0, 0, 0),
        ass_font_size=68,
        ass_outline=3,
        ass_shadow=1,
        ass_margin_v=170,
    ),
    'douyin_bold': SubtitleTheme(
        label='抖音粗体',
        font_scale=0.058,
        min_font_size=36,
        stroke_width=4,
        shadow_offset=2,
        box_enabled=True,
        box_opacity=150,
        margin_bottom_ratio=0.12,
        max_width_ratio=0.82,
        line_spacing=12,
        fill_rgba=(255, 255, 255, 255),
        stroke_rgba=(0, 0, 0, 235),
        shadow_rgba=(0, 0, 0, 120),
        box_rgba=(0, 0, 0, 150),
        ass_font_size=74,
        ass_outline=4,
        ass_shadow=1,
        ass_margin_v=165,
    ),
    'soft_minimal': SubtitleTheme(
        label='柔和极简',
        font_scale=0.047,
        min_font_size=30,
        stroke_width=1,
        shadow_offset=2,
        box_enabled=True,
        box_opacity=92,
        margin_bottom_ratio=0.16,
        max_width_ratio=0.74,
        line_spacing=10,
        fill_rgba=(248, 246, 239, 245),
        stroke_rgba=(0, 0, 0, 150),
        shadow_rgba=(0, 0, 0, 80),
        box_rgba=(20, 20, 20, 92),
        ass_font_size=62,
        ass_outline=2,
        ass_shadow=1,
        ass_margin_v=210,
        bold=False,
    ),
}


def resolve_subtitle_theme(theme_name: str | None) -> SubtitleTheme:
    key = (theme_name or '').strip() or 'douyin_bold'
    return SUBTITLE_THEMES.get(key, SUBTITLE_THEMES['douyin_bold'])


def _ass_colour(rgba: tuple[int, int, int, int]) -> str:
    red, green, blue, alpha = rgba
    ass_alpha = 255 - max(0, min(alpha, 255))
    return f'&H{ass_alpha:02X}{blue:02X}{green:02X}{red:02X}'


def ass_style_line(theme_name: str | None = None) -> str:
    theme = resolve_subtitle_theme(theme_name)
    bold = -1 if theme.bold else 0
    return (
        'Style: Default,PingFang SC,'
        f'{theme.ass_font_size},{_ass_colour(theme.fill_rgba)},&H000000FF,'
        f'{_ass_colour(theme.stroke_rgba)},{_ass_colour(theme.box_rgba)},'
        f'{bold},0,0,0,100,100,0,0,1,{theme.ass_outline},{theme.ass_shadow},'
        f'2,80,80,{theme.ass_margin_v},1'
    )


def burn_or_fallback(
    video_path: Path,
    srt_path: Path,
    ass_path: Path,
    folder: Path,
    subtitle_burn_filter: SubtitleBurnFilter,
    burn_subtitles_with_overlay: BurnSubtitlesWithOverlay,
    burn_subtitles_only: BurnSubtitlesOnly,
    subtitle_burn_error_message: SubtitleBurnErrorMessage,
    subtitle_theme: str = 'douyin_bold',
) -> tuple[Path, dict[str, str], object]:
    mastered_path = folder / 'final_mastered.mp4'
    if subtitle_burn_filter() is None:
        burn_res = burn_subtitles_with_overlay(video_path, srt_path, mastered_path, folder, subtitle_theme)
        if getattr(burn_res, 'returncode', 1) != 0 or not mastered_path.exists():
            fallback_output = folder / 'final_with_external_subtitles.mp4'
            shutil.copy2(video_path, fallback_output)
            return fallback_output, {
                'subtitle_mode': 'external_only',
                'subtitle_error': subtitle_burn_error_message((getattr(burn_res, 'stderr', '') or getattr(burn_res, 'stdout', '')).strip()),
            }, burn_res
        return mastered_path, {'subtitle_mode': 'burned', 'subtitle_backend': f'overlay:{subtitle_theme}'}, burn_res

    burn_res = burn_subtitles_only(video_path, ass_path, mastered_path)
    if getattr(burn_res, 'returncode', 1) != 0 or not mastered_path.exists():
        fallback_output = folder / 'final_with_external_subtitles.mp4'
        shutil.copy2(video_path, fallback_output)
        return fallback_output, {
            'subtitle_mode': 'external_only',
            'subtitle_error': subtitle_burn_error_message((getattr(burn_res, 'stderr', '') or getattr(burn_res, 'stdout', '')).strip()),
        }, burn_res
    return mastered_path, {'subtitle_mode': 'burned', 'subtitle_backend': subtitle_burn_filter() or 'filter'}, burn_res
