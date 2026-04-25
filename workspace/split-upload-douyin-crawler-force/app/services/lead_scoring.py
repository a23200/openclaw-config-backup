from dataclasses import dataclass
import difflib
import re


HIGH_INTENT_KEYWORDS = {
    "多少钱": 30,
    "价格": 25,
    "报价": 25,
    "怎么买": 30,
    "购买": 25,
    "怎么联系": 30,
    "联系方式": 30,
    "微信": 20,
    "vx": 20,
    "电话": 20,
    "私我": 20,
    "想了解": 20,
    "咨询": 20,
}

LEVEL_ORDER = {"low": 0, "medium": 1, "high": 2}

MEDIUM_INTENT_KEYWORDS = {
    "怎么样": 15,
    "有用吗": 15,
    "效果": 15,
    "适合": 15,
    "怎么做": 15,
    "教程": 10,
    "真的吗": 10,
}

NEGATIVE_KEYWORDS = {
    "广告": -25,
    "骗子": -30,
    "托": -20,
    "垃圾": -20,
    "路过": -10,
    "无语": -10,
}


@dataclass
class ScoreResult:
    score: int
    level: str
    hit_keywords: list[str]
    reasons: list[str]
    custom_match_score: int = 0
    matched_custom_keywords: list[str] | None = None


def normalize_min_level(value: str | None) -> str:
    normalized = (value or "medium").strip().lower()
    if normalized in {"all", "low"}:
        return "low"
    if normalized == "high":
        return "high"
    return "medium"


def matches_min_level(level: str, min_level: str | None) -> bool:
    return LEVEL_ORDER.get(level, 0) >= LEVEL_ORDER.get(normalize_min_level(min_level), 1)


def _normalize_custom_keywords(custom_keywords: list[str] | None) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for keyword in custom_keywords or []:
        value = re.sub(r"\s+", " ", (keyword or "").strip().lower())
        if not value or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return normalized


def _keyword_similarity(content: str, keyword: str) -> float:
    if not content or not keyword:
        return 0.0
    if keyword in content:
        return 1.0

    longest_match = difflib.SequenceMatcher(None, keyword, content).find_longest_match(
        0, len(keyword), 0, len(content)
    )
    contiguous_ratio = longest_match.size / max(len(keyword), 1)
    char_overlap = sum(1 for char in set(keyword) if char in content) / max(len(set(keyword)), 1)
    return max(contiguous_ratio, char_overlap)


def score_comment(content: str, custom_keywords: list[str] | None = None) -> ScoreResult:
    normalized = content.strip().lower()
    score = 5 if normalized else 0
    hit_keywords: list[str] = []
    reasons: list[str] = []
    matched_custom_keywords: list[str] = []
    custom_match_score = 0

    for keyword, weight in HIGH_INTENT_KEYWORDS.items():
        if keyword in normalized:
            score += weight
            hit_keywords.append(keyword)
            reasons.append(f"命中高意向词：{keyword}")

    for keyword, weight in MEDIUM_INTENT_KEYWORDS.items():
        if keyword in normalized:
            score += weight
            hit_keywords.append(keyword)
            reasons.append(f"命中中意向词：{keyword}")

    for keyword, weight in NEGATIVE_KEYWORDS.items():
        if keyword in normalized:
            score += weight
            hit_keywords.append(keyword)
            reasons.append(f"命中负向词：{keyword}")

    if "?" in normalized or "？" in normalized:
        score += 5
        reasons.append("包含问句")

    if any(char.isdigit() for char in normalized):
        score += 5
        reasons.append("包含数字信息")

    for keyword in _normalize_custom_keywords(custom_keywords):
        similarity = _keyword_similarity(normalized, keyword)
        if similarity >= 1:
            score += 30
            custom_match_score = max(custom_match_score, 30)
            matched_custom_keywords.append(keyword)
            hit_keywords.append(keyword)
            reasons.append(f"强匹配规则词：{keyword}")
        elif similarity >= 0.7:
            score += 20
            custom_match_score = max(custom_match_score, 20)
            matched_custom_keywords.append(keyword)
            hit_keywords.append(keyword)
            reasons.append(f"高匹配规则词：{keyword}")
        elif similarity >= 0.45:
            score += 10
            custom_match_score = max(custom_match_score, 10)
            matched_custom_keywords.append(keyword)
            hit_keywords.append(keyword)
            reasons.append(f"中匹配规则词：{keyword}")

    score = max(0, min(score, 100))

    if score >= 70:
        level = "high"
    elif score >= 40:
        level = "medium"
    else:
        level = "low"

    return ScoreResult(
        score=score,
        level=level,
        hit_keywords=sorted(set(hit_keywords)),
        reasons=reasons or ["未命中明显意向特征"],
        custom_match_score=custom_match_score,
        matched_custom_keywords=sorted(set(matched_custom_keywords)),
    )
