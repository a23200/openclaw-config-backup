from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable


MakeNarrationText = Callable[[str, dict], str]
GenerateTtsAudio = Callable[[str, Path, str, bool], object]


@dataclass(frozen=True)
class StyleProfile:
    rhythm: str
    sentence_rule: str
    filler_density: str
    max_sentence_chars: int
    target_chars: int
    chars_per_second: float
    recommended_voices: tuple[str, ...]
    recommended_speed: float
    gain: float
    pause_bias: float


@dataclass(frozen=True)
class VoiceStyleConfig:
    voice_profile: str
    voice: str
    speed: float
    gain: float
    pause_bias: float
    style: str
    category: str

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


style_profile_map: dict[str, StyleProfile] = {
    'documentary': StyleProfile(
        rhythm='短句、冷静、解释感强',
        sentence_rule='每句只承载一个信息点，少用感叹和夸张词',
        filler_density='low',
        max_sentence_chars=24,
        target_chars=120,
        chars_per_second=4.2,
        recommended_voices=('steady_male', 'calm_female'),
        recommended_speed=0.96,
        gain=1.0,
        pause_bias=0.18,
    ),
    'emotional': StyleProfile(
        rhythm='留白、多停顿、画面感更强',
        sentence_rule='多短句和呼吸点，减少解释，把感受留给画面',
        filler_density='medium',
        max_sentence_chars=18,
        target_chars=95,
        chars_per_second=3.5,
        recommended_voices=('warm_female', 'calm_female'),
        recommended_speed=0.9,
        gain=0.96,
        pause_bias=0.42,
    ),
    'explain': StyleProfile(
        rhythm='逻辑清楚、句子完整',
        sentence_rule='先点题，再解释，最后给记忆点',
        filler_density='low',
        max_sentence_chars=30,
        target_chars=145,
        chars_per_second=4.6,
        recommended_voices=('clear_male', 'bright_female'),
        recommended_speed=1.02,
        gain=1.02,
        pause_bias=0.12,
    ),
    'opinion': StyleProfile(
        rhythm='先观点、后理由、最后收束',
        sentence_rule='第一句给判断，中间给原因，结尾收成态度',
        filler_density='low',
        max_sentence_chars=28,
        target_chars=130,
        chars_per_second=4.1,
        recommended_voices=('elder_male', 'steady_male'),
        recommended_speed=0.98,
        gain=1.0,
        pause_bias=0.2,
    ),
}


OPENAI_VOICE_BY_PROFILE = {
    'calm_female': 'nova',
    'warm_female': 'shimmer',
    'bright_female': 'alloy',
    'steady_male': 'echo',
    'clear_male': 'fable',
    'elder_male': 'onyx',
}

CATEGORY_VOICE_HINTS = {
    'science': 'steady_male',
    'explain': 'clear_male',
    'opinion': 'elder_male',
    'list': 'bright_female',
    'healing': 'warm_female',
    'aesthetic': 'calm_female',
}


def _normalize_style(style: str | None) -> str:
    style_value = (style or '').strip().lower()
    return style_value if style_value in style_profile_map else 'documentary'


def _normalize_category(category: str | None) -> str:
    return (category or 'auto').strip().lower() or 'auto'


def _estimate_target_chars(duration: float, profile: StyleProfile | None = None) -> int:
    if duration <= 0:
        return 60
    selected_profile = profile or style_profile_map['documentary']
    estimated = int(duration * selected_profile.chars_per_second)
    return max(35, min(estimated, selected_profile.target_chars, 220))


def _split_sentences(text: str) -> list[str]:
    parts = []
    current = ''
    for char in text.strip():
        current += char
        if char in '。！？!?；;':
            parts.append(current.strip())
            current = ''
    if current.strip():
        parts.append(current.strip())
    return [part for part in parts if part]


def _clean_narration_source(text: str) -> str:
    cleaned = re.sub(r'[\(\（][^\)\）]*(镜头|画面|字幕|旁白|停顿|音乐)[^\)\）]*[\)\）]', '', text)
    cleaned = re.sub(r'\s+', '', cleaned.strip())
    cleaned = re.sub(r'[!！]{2,}', '。', cleaned)
    cleaned = re.sub(r'[。]{2,}', '。', cleaned)
    cleaned = re.sub(r'(嗯|呃|啊|就是|然后)[，,、\s]*(\1[，,、\s]*)+', r'\1，', cleaned)
    return cleaned.strip('，,、；; ')


def _ensure_sentence_end(text: str) -> str:
    if not text:
        return text
    return text if text[-1] in '。！？!?' else text + '。'


def _split_long_sentence(sentence: str, max_chars: int) -> list[str]:
    if len(sentence) <= max_chars:
        return [_ensure_sentence_end(sentence)]
    chunks: list[str] = []
    current = ''
    for segment in re.split(r'([，,、；;])', sentence):
        if not segment:
            continue
        trial = current + segment
        if current and len(trial) > max_chars:
            chunks.append(_ensure_sentence_end(current.strip('，,、；; ')))
            current = segment.strip('，,、；; ')
        else:
            current = trial
    if current.strip():
        chunks.append(_ensure_sentence_end(current.strip('，,、；; ')))
    final_chunks: list[str] = []
    for chunk in chunks:
        if len(chunk) <= max_chars + 2:
            final_chunks.append(chunk)
            continue
        body = chunk.rstrip('。！？!?')
        for start_index in range(0, len(body), max_chars):
            final_chunks.append(_ensure_sentence_end(body[start_index:start_index + max_chars]))
    return [chunk for chunk in final_chunks if chunk.strip()]


def _shorten_sentences(sentences: list[str], max_chars: int) -> list[str]:
    shortened: list[str] = []
    for sentence in sentences:
        shortened.extend(_split_long_sentence(sentence, max_chars))
    return shortened


def _clip_sentences(sentences: list[str], target_chars: int) -> str:
    chosen: list[str] = []
    total_chars = 0
    for sentence in sentences:
        next_total = total_chars + len(sentence)
        if chosen and next_total > target_chars:
            break
        chosen.append(sentence)
        total_chars = next_total
    if not chosen and sentences:
        chosen.append(sentences[0][:target_chars].rstrip('，,、；; ') + '。')
    return ''.join(chosen).strip()


def _rewrite_documentary(text: str, profile: StyleProfile) -> str:
    text = text.replace('！', '。').replace('!', '。')
    text = re.sub(r'(太|非常|特别)(震撼|惊人|厉害)', r'\2', text)
    sentences = _shorten_sentences(_split_sentences(text), profile.max_sentence_chars)
    return ''.join(sentences)


def _rewrite_emotional(text: str, profile: StyleProfile) -> str:
    text = text.replace('，', '。').replace(',', '。').replace('；', '。').replace(';', '。')
    sentences = _shorten_sentences(_split_sentences(text), profile.max_sentence_chars)
    if len(''.join(sentences)) < 45 and sentences:
        sentences.append('慢一点看，情绪会自己浮出来。')
    return ''.join(sentences)


def _rewrite_explain(text: str, profile: StyleProfile) -> str:
    sentences = _shorten_sentences(_split_sentences(text), profile.max_sentence_chars)
    if len(sentences) >= 3 and not re.search(r'(先|再|最后|第一|第二|第三)', ''.join(sentences)):
        return f'先看{sentences[0].rstrip("。")}。再看{sentences[1].rstrip("。")}。最后，{sentences[2].rstrip("。")}。'
    return ''.join(sentences)


def _rewrite_opinion(text: str, title: str, profile: StyleProfile) -> str:
    sentences = _shorten_sentences(_split_sentences(text), profile.max_sentence_chars)
    joined = ''.join(sentences)
    if re.search(r'(我的看法|我更愿意|真正|所以|最后)', joined):
        return joined
    if len(sentences) >= 3:
        return f'我的看法是，{sentences[0].rstrip("。")}。原因很简单，{sentences[1].rstrip("。")}。最后，{sentences[2].rstrip("。")}。'
    topic = title.strip() or '这件事'
    return f'我的看法是，{topic}值得重新理解。它不只是一个画面，也是一种正在变化的感受。最后，真正留下来的，是我们看待它的方式。'


def rewrite_narration_by_style(text: str, title: str, style: str, duration: float) -> str:
    normalized_style = _normalize_style(style)
    profile = style_profile_map[normalized_style]
    cleaned = _clean_narration_source(text)
    if not cleaned:
        cleaned = title.strip()
    if normalized_style == 'emotional':
        rewritten = _rewrite_emotional(cleaned, profile)
    elif normalized_style == 'explain':
        rewritten = _rewrite_explain(cleaned, profile)
    elif normalized_style == 'opinion':
        rewritten = _rewrite_opinion(cleaned, title, profile)
    else:
        rewritten = _rewrite_documentary(cleaned, profile)
    target_chars = _estimate_target_chars(duration, profile)
    sentences = _shorten_sentences(_split_sentences(rewritten), profile.max_sentence_chars)
    return _clip_sentences(sentences, target_chars) or _ensure_sentence_end(cleaned)


def make_natural_narration(text: str, duration: float, profile: StyleProfile | None = None) -> str:
    sentences = _split_sentences(text)
    if not sentences:
        return text.strip()
    target_chars = _estimate_target_chars(duration, profile)
    result = _clip_sentences(sentences, target_chars)
    return result or text.strip()


def build_narration_text(title: str, state: dict, make_narration_text: MakeNarrationText, duration: float) -> str:
    raw = make_narration_text(title, state)
    style = str(state.get('post', {}).get('narration_style') or state.get('input', {}).get('narration_style') or 'documentary')
    profile = style_profile_map[_normalize_style(style)]
    rewritten = rewrite_narration_by_style(raw, title, style, duration)
    return make_natural_narration(rewritten, duration, profile)


def resolve_voice_profile(style: str, category: str = 'auto', preferred_voice: str = '') -> VoiceStyleConfig:
    normalized_style = _normalize_style(style)
    normalized_category = _normalize_category(category)
    profile = style_profile_map[normalized_style]
    preferred = (preferred_voice or '').strip()
    voice_profile = preferred if preferred in OPENAI_VOICE_BY_PROFILE else ''
    if not voice_profile and preferred in set(OPENAI_VOICE_BY_PROFILE.values()):
        voice_profile = next((name for name, voice in OPENAI_VOICE_BY_PROFILE.items() if voice == preferred), '')
    if not voice_profile:
        voice_profile = CATEGORY_VOICE_HINTS.get(normalized_category, profile.recommended_voices[0])
    if voice_profile not in OPENAI_VOICE_BY_PROFILE:
        voice_profile = profile.recommended_voices[0]
    return VoiceStyleConfig(
        voice_profile=voice_profile,
        voice=OPENAI_VOICE_BY_PROFILE[voice_profile],
        speed=profile.recommended_speed,
        gain=profile.gain,
        pause_bias=profile.pause_bias,
        style=normalized_style,
        category=normalized_category,
    )


def select_voice_profile(state: dict) -> str:
    post = state.get('post', {})
    style = str(post.get('narration_style') or state.get('input', {}).get('narration_style') or 'documentary')
    category = str(post.get('material_category') or state.get('input', {}).get('material_category') or 'auto')
    preferred = str(post.get('voice_profile') or state.get('input', {}).get('voice_profile') or '')
    return resolve_voice_profile(style, category, preferred).voice_profile


def generate_narration_audio(
    narration_text: str,
    output_path: Path,
    state: dict,
    generate_tts_audio: GenerateTtsAudio,
) -> object:
    post = state.setdefault('post', {})
    is_material = state.get('task_type') == 'material'
    style = str(post.get('narration_style') or state.get('input', {}).get('narration_style') or 'documentary')
    category = str(post.get('material_category') or state.get('input', {}).get('material_category') or 'auto')
    preferred = str(post.get('voice_profile') or state.get('input', {}).get('voice_profile') or ('calm_female' if not is_material else ''))
    voice_config = resolve_voice_profile(style, category, preferred)
    if is_material:
        post['voice_profile'] = voice_config.voice_profile
        post['voice_style_config'] = voice_config.to_dict()
        post['tts_voice'] = voice_config.voice
        post['tts_speed'] = voice_config.speed
        post['voice_gain'] = voice_config.gain
        post['pause_bias'] = voice_config.pause_bias
    prefer_say = not bool(state.get('post', {}).get('enable_natural_voiceover', True))
    return generate_tts_audio(narration_text, output_path, voice_config.voice_profile, prefer_say=prefer_say)
