from __future__ import annotations

from typing import Callable

from ..base import PostprocessArtifacts, PostprocessContext, PostprocessResult, PostprocessStrategy
from ..burn_subtitles import burn_or_fallback


class ThemeSubtitleStrategy(PostprocessStrategy):
    mode = 'title_card'

    def __init__(
        self,
        *,
        write_title_card_srt: Callable[[str, float, object], None],
        write_simple_srt: Callable[[str, float, object], None],
        srt_to_ass: Callable[..., None],
        subtitle_burn_filter: Callable[[], str | None],
        burn_subtitles_with_overlay: Callable[[object, object, object, object, str], object],
        burn_subtitles_only: Callable[[object, object, object], object],
        subtitle_burn_error_message: Callable[[str], str],
    ):
        self.write_title_card_srt = write_title_card_srt
        self.write_simple_srt = write_simple_srt
        self.srt_to_ass = srt_to_ass
        self.subtitle_burn_filter = subtitle_burn_filter
        self.burn_subtitles_with_overlay = burn_subtitles_with_overlay
        self.burn_subtitles_only = burn_subtitles_only
        self.subtitle_burn_error_message = subtitle_burn_error_message

    def run(self, context: PostprocessContext) -> PostprocessResult:
        srt_path = context.folder / 'subtitles.srt'
        ass_path = context.folder / 'subtitles.ass'
        title_text = context.state.get('post', {}).get('title_card_text') or '穿过黑暗，前面就是早晨'
        subtitle_theme = str(context.state.get('post', {}).get('subtitle_style') or 'douyin_bold')
        context.update_status('subtitle_refining')
        if context.state.get('post', {}).get('resolved_mode') == 'title_card':
            self.write_title_card_srt(title_text, context.duration, srt_path)
        else:
            self.write_simple_srt(context.state['title'], context.duration, srt_path)
        try:
            self.srt_to_ass(srt_path, ass_path, subtitle_theme)
        except TypeError:
            self.srt_to_ass(srt_path, ass_path)
        context.update_status('subtitle_burning')
        final_video, meta, _ = burn_or_fallback(
            context.final_path,
            srt_path,
            ass_path,
            context.folder,
            self.subtitle_burn_filter,
            self.burn_subtitles_with_overlay,
            self.burn_subtitles_only,
            self.subtitle_burn_error_message,
            subtitle_theme,
        )
        context.update_status('final_packaging')
        return PostprocessResult(
            mode=self.mode,
            final_video=final_video,
            subtitle_mode=meta.get('subtitle_mode'),
            subtitle_backend=meta.get('subtitle_backend'),
            subtitle_error=meta.get('subtitle_error'),
            artifacts=PostprocessArtifacts(final_video=final_video, subtitle_srt=srt_path, subtitle_ass=ass_path),
            metadata={'subtitle_style': subtitle_theme},
        )
