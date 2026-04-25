from __future__ import annotations

from typing import Callable

from ..audio_mix import attach_narration_to_video, mix_narration_with_bgm, normalize_voiceover
from ..base import PostprocessArtifacts, PostprocessContext, PostprocessResult, PostprocessStrategy
from ..burn_subtitles import burn_or_fallback
from ..narration import build_narration_text, generate_narration_audio
from ..subtitle_sync import generate_synced_subtitles


class NarratedStrategy(PostprocessStrategy):
    mode = 'narrated'

    def __init__(
        self,
        *,
        make_narration_text: Callable[[str, dict], str],
        generate_tts_audio: Callable[[str, object, str, bool], object],
        transcribe_with_whisper: Callable[[object, object], object],
        write_simple_srt: Callable[[str, float, object], None],
        srt_to_ass: Callable[[object, object], None],
        merge_audio_video_only: Callable[[object, object, object], object],
        run_args: Callable[[list[str]], object],
        subtitle_burn_filter: Callable[[], str | None],
        burn_subtitles_with_overlay: Callable[[object, object, object, object], object],
        burn_subtitles_only: Callable[[object, object, object], object],
        subtitle_burn_error_message: Callable[[str], str],
    ):
        self.make_narration_text = make_narration_text
        self.generate_tts_audio = generate_tts_audio
        self.transcribe_with_whisper = transcribe_with_whisper
        self.write_simple_srt = write_simple_srt
        self.srt_to_ass = srt_to_ass
        self.merge_audio_video_only = merge_audio_video_only
        self.run_args = run_args
        self.subtitle_burn_filter = subtitle_burn_filter
        self.burn_subtitles_with_overlay = burn_subtitles_with_overlay
        self.burn_subtitles_only = burn_subtitles_only
        self.subtitle_burn_error_message = subtitle_burn_error_message

    def run(self, context: PostprocessContext) -> PostprocessResult:
        narration_text = build_narration_text(context.state['title'], context.state, self.make_narration_text, context.duration)
        context.state['post']['narration_text'] = narration_text
        context.update_status('narration_script_ready')

        narration_path = context.folder / 'narration.mp3'
        context.update_status('tts_generating')
        tts_res = generate_narration_audio(narration_text, narration_path, context.state, self.generate_tts_audio)
        if getattr(tts_res, 'returncode', 1) != 0 or not narration_path.exists():
            raise RuntimeError('旁白生成失败: ' + ((getattr(tts_res, 'stderr', '') or getattr(tts_res, 'stdout', '')).strip() or 'unknown'))
        tts_args = getattr(tts_res, 'args', [])
        first_arg = tts_args[0] if isinstance(tts_args, (list, tuple)) and tts_args else str(tts_args).split(' ', 1)[0]
        if first_arg == 'openai_tts':
            tts_engine = 'openai_tts'
        elif first_arg == 'edge_tts':
            tts_engine = 'edge_tts'
        elif first_arg == 'say':
            tts_engine = 'system_say'
        else:
            tts_engine = 'fallback_tts'

        voice_config = context.state.get('post', {}).get('voice_style_config') or {}
        normalization_speed = 1.0 if tts_engine in {'system_say', 'edge_tts'} else float(voice_config.get('speed') or 1.0)
        normalized_path, normalize_res = normalize_voiceover(
            narration_path,
            context.folder,
            self.run_args,
            speed=normalization_speed,
            gain=float(voice_config.get('gain') or 1.0),
        )
        voiceover_path = normalized_path if getattr(normalize_res, 'returncode', 1) == 0 and normalized_path.exists() else narration_path
        context.update_status('tts_ready')

        context.update_status('bgm_mixing')
        bgm_path = str(context.state.get('post', {}).get('bgm_path') or context.state.get('input', {}).get('bgm_path') or '').strip()
        audio_for_video = voiceover_path
        mixed_audio_path = None
        mix_params = {
            'voice_gain': float(voice_config.get('gain') or 1.0),
            'bgm_volume': 0.28,
            'ducking': 'sidechaincompress_or_fallback',
            'target_duration': round(context.duration, 3),
        }
        if bgm_path:
            mixed_audio_path, mix_res = mix_narration_with_bgm(
                context.folder,
                voiceover_path,
                bgm_path,
                self.run_args,
                target_duration=context.duration,
                voice_gain=mix_params['voice_gain'],
                bgm_volume=mix_params['bgm_volume'],
            )
            if mixed_audio_path and getattr(mix_res, 'returncode', 1) == 0 and mixed_audio_path.exists():
                audio_for_video = mixed_audio_path

        narrated_path, merge_audio_res = attach_narration_to_video(
            context.final_path,
            audio_for_video,
            context.folder,
            self.merge_audio_video_only,
        )
        if getattr(merge_audio_res, 'returncode', 1) != 0 or not narrated_path.exists():
            raise RuntimeError('音频合成失败: ' + ((getattr(merge_audio_res, 'stderr', '') or getattr(merge_audio_res, 'stdout', '')).strip() or 'unknown'))

        subtitle_theme = str(context.state.get('post', {}).get('subtitle_style') or 'douyin_bold')
        context.update_status('subtitle_transcribing')
        raw_srt_path, srt_path, ass_path, _ = generate_synced_subtitles(
            narration_text,
            voiceover_path,
            context.folder,
            context.duration,
            self.transcribe_with_whisper,
            self.write_simple_srt,
            self.srt_to_ass,
            subtitle_theme,
        )
        context.update_status('subtitle_refining')
        context.update_status('subtitle_burning')
        final_video, meta, _ = burn_or_fallback(
            narrated_path,
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
            artifacts=PostprocessArtifacts(
                narration_audio=narration_path,
                normalized_narration_audio=normalized_path if normalized_path.exists() else None,
                raw_subtitle_srt=raw_srt_path,
                subtitle_srt=srt_path,
                subtitle_ass=ass_path,
                mixed_audio=mixed_audio_path,
                final_video=final_video,
                extra_files=[narrated_path],
            ),
            metadata={
                'tts_engine': tts_engine,
                'voice_style_config': voice_config,
                'mix_params': mix_params,
                'subtitle_style': subtitle_theme,
                'voiceover_normalized': str(voiceover_path),
            },
        )
