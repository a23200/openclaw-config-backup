"""短文题目分析服务。

单次 LLM 调用,根据题目与梗概判断短文(约 1 万字)的章节形态:
- narrative  → 1 章独章(约 10000 字)
- expository / argumentative → 3-5 节(每节 2000-2800 字)

输出 ArticleStructure,供 NovelService 直接把章节节点写入 story_nodes。
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import List, Literal

from domain.ai.services.llm_service import GenerationConfig, LLMService
from domain.ai.value_objects.prompt import Prompt
from application.blueprint.services.continuous_planning_service import (
    _extract_outer_json_value,
    _repair_json_string,
)

logger = logging.getLogger(__name__)


StructureType = Literal["narrative", "expository", "argumentative"]


@dataclass(frozen=True)
class ArticleStructure:
    structure_type: StructureType
    chapter_count: int
    chapter_words: int
    section_titles: List[str]
    section_outlines: List[str]

    def total_target_words(self) -> int:
        return self.chapter_count * self.chapter_words


class ArticleTopicAnalyzer:
    """轻量题目分析:题目+梗概 → 结构建议(1 次 LLM 调用)。"""

    PROMPT_ID = "article-topic-analysis"

    _SYSTEM = (
        "你是一位短文结构编辑。根据给出的题目与梗概,判断这篇约 1 万字的文章最合适的篇章形态:\n\n"
        "- narrative(叙事):故事、回忆、散文 → 1 章独章(约 10000 字),情节连贯一气呵成。\n"
        "- expository(说明/科普):知识性内容 → 3-5 节(每节 2000-2800 字),每节聚焦一个知识点。\n"
        "- argumentative(议论):观点、分析、评论 → 3-5 节(每节 2000-2800 字),每节一个论证层次。\n\n"
        "输出纯 JSON,无 markdown 代码块,无多余解释。Schema:\n\n"
        "{\n"
        "  \"structure_type\": \"narrative | expository | argumentative\",\n"
        "  \"chapter_count\": 1-5,\n"
        "  \"chapter_words\": 2000-10000,\n"
        "  \"section_titles\": [各章/节标题, 长度必须等于 chapter_count],\n"
        "  \"section_outlines\": [各章/节 100-200 字大纲, 长度必须等于 chapter_count]\n"
        "}\n\n"
        "规则:\n"
        "1. narrative 时 chapter_count 必须为 1, chapter_words 约 10000。\n"
        "2. expository/argumentative 时 chapter_count ∈ [3,5], chapter_words ≈ 10000/chapter_count。\n"
        "3. section_titles 与 section_outlines 数组长度必须等于 chapter_count。\n"
        "4. 大纲用平实语言说明这一节要讲什么、怎么展开,不要写成章节概要的套话。"
    )

    def __init__(self, llm_service: LLMService) -> None:
        self._llm = llm_service

    async def analyze(self, title: str, premise: str) -> ArticleStructure:
        """调用 LLM 分析题目,返回结构建议。失败时回退到 narrative 单章。"""
        title_clean = (title or "").strip() or "(未命名)"
        premise_clean = (premise or "").strip() or "(无梗概)"
        user = f"【题目】\n{title_clean}\n\n【梗概/说明】\n{premise_clean}\n\n请输出结构 JSON。"

        config = GenerationConfig(max_tokens=1024, temperature=0.3)
        prompt = Prompt(system=self._SYSTEM, user=user)

        try:
            result = await self._llm.generate(prompt, config)
            raw = result.content if result else ""
        except Exception as e:
            logger.warning("ArticleTopicAnalyzer LLM failed: %s — fallback narrative", e)
            return self._fallback(title_clean)

        parsed = self._parse(raw)
        if parsed is None:
            logger.warning("ArticleTopicAnalyzer JSON parse failed — fallback narrative. raw=%s", raw[:200])
            return self._fallback(title_clean)
        return parsed

    def _parse(self, text: str) -> ArticleStructure | None:
        if not text or not text.strip():
            return None
        try:
            extracted = _extract_outer_json_value(text)
            repaired = _repair_json_string(extracted)
            data = json.loads(repaired)
        except Exception:
            return None
        if not isinstance(data, dict):
            return None

        stype_raw = str(data.get("structure_type", "narrative")).strip().lower()
        if stype_raw not in ("narrative", "expository", "argumentative"):
            stype_raw = "narrative"

        try:
            count = int(data.get("chapter_count") or 0)
        except (TypeError, ValueError):
            count = 0
        try:
            words = int(data.get("chapter_words") or 0)
        except (TypeError, ValueError):
            words = 0

        titles = data.get("section_titles") or []
        outlines = data.get("section_outlines") or []
        if not isinstance(titles, list) or not isinstance(outlines, list):
            return None

        # normalize & clamp
        if stype_raw == "narrative":
            count = 1
            if words <= 0:
                words = 10000
            words = max(5000, min(12000, words))
        else:
            if count < 3:
                count = 3
            if count > 5:
                count = 5
            if words <= 0:
                words = max(2000, 10000 // count)
            words = max(1500, min(4000, words))

        titles = [str(t).strip() for t in titles if str(t).strip()]
        outlines = [str(o).strip() for o in outlines if str(o).strip()]
        # 长度与 count 对齐:不足补占位,超出截断
        while len(titles) < count:
            titles.append(f"第{len(titles) + 1}节")
        while len(outlines) < count:
            outlines.append("")
        titles = titles[:count]
        outlines = outlines[:count]

        return ArticleStructure(
            structure_type=stype_raw,  # type: ignore[arg-type]
            chapter_count=count,
            chapter_words=words,
            section_titles=titles,
            section_outlines=outlines,
        )

    @staticmethod
    def _fallback(title: str) -> ArticleStructure:
        return ArticleStructure(
            structure_type="narrative",
            chapter_count=1,
            chapter_words=10000,
            section_titles=[title or "正文"],
            section_outlines=[""],
        )
