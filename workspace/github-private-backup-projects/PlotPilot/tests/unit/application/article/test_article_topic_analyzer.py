"""ArticleTopicAnalyzer:轻量 LLM 题目分析。

用 FakeLLMService 喂不同 JSON,验证:
- narrative 结构强制 1 章 / ≈10000 字
- expository/argumentative 结构 3-5 章 / ≈2000-4000 字
- 坏 JSON 容错 → fallback narrative
- LLM 异常 → fallback narrative
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import AsyncIterator, List

import pytest

from application.article.services.article_topic_analyzer import (
    ArticleStructure,
    ArticleTopicAnalyzer,
)
from domain.ai.services.llm_service import GenerationConfig, GenerationResult, LLMService
from domain.ai.value_objects.prompt import Prompt
from domain.ai.value_objects.token_usage import TokenUsage


@dataclass
class _FakeResult:
    content: str

    @property
    def token_usage(self):  # pragma: no cover - unused
        return None


class FakeLLMService(LLMService):
    def __init__(self, responses: List[str], raise_on_call: bool = False):
        self.responses = list(responses)
        self.raise_on_call = raise_on_call
        self.calls: List[Prompt] = []

    async def generate(self, prompt: Prompt, config: GenerationConfig) -> GenerationResult:
        self.calls.append(prompt)
        if self.raise_on_call:
            raise RuntimeError("boom")
        content = self.responses.pop(0) if self.responses else "{}"
        return _FakeResult(content=content)  # type: ignore[return-value]

    async def stream_generate(
        self, prompt: Prompt, config: GenerationConfig
    ) -> AsyncIterator[str]:  # pragma: no cover - unused
        if False:
            yield ""


@pytest.mark.asyncio
async def test_narrative_response_parses_to_single_chapter():
    payload = {
        "structure_type": "narrative",
        "chapter_count": 1,
        "chapter_words": 10000,
        "section_titles": ["城市里的十分钟"],
        "section_outlines": ["主角在十字路口等红灯时,想起一段十年前的回忆。"],
    }
    llm = FakeLLMService([json.dumps(payload, ensure_ascii=False)])
    analyzer = ArticleTopicAnalyzer(llm_service=llm)
    out = await analyzer.analyze("城市里的十分钟", "一段路口回忆")
    assert out.structure_type == "narrative"
    assert out.chapter_count == 1
    assert out.chapter_words == 10000
    assert out.section_titles == ["城市里的十分钟"]


@pytest.mark.asyncio
async def test_expository_response_clamps_to_three_to_five_sections():
    payload = {
        "structure_type": "expository",
        "chapter_count": 4,
        "chapter_words": 2500,
        "section_titles": ["一", "二", "三", "四"],
        "section_outlines": ["aa", "bb", "cc", "dd"],
    }
    llm = FakeLLMService([json.dumps(payload, ensure_ascii=False)])
    analyzer = ArticleTopicAnalyzer(llm_service=llm)
    out = await analyzer.analyze("AI 写作的四个误区", "一篇说明文")
    assert out.structure_type == "expository"
    assert 3 <= out.chapter_count <= 5
    assert out.chapter_count == 4
    assert len(out.section_titles) == 4
    assert len(out.section_outlines) == 4


@pytest.mark.asyncio
async def test_broken_json_falls_back_to_narrative():
    llm = FakeLLMService(["{ 这不是 JSON"])
    analyzer = ArticleTopicAnalyzer(llm_service=llm)
    out = await analyzer.analyze("题目", "梗概")
    assert out.structure_type == "narrative"
    assert out.chapter_count == 1
    assert out.chapter_words == 10000


@pytest.mark.asyncio
async def test_llm_exception_falls_back_to_narrative():
    llm = FakeLLMService([], raise_on_call=True)
    analyzer = ArticleTopicAnalyzer(llm_service=llm)
    out = await analyzer.analyze("题目", "梗概")
    assert out.structure_type == "narrative"
    assert out.chapter_count == 1


@pytest.mark.asyncio
async def test_short_title_outline_arrays_get_padded():
    """LLM 返回的 titles/outlines 长度不足 chapter_count 时,分析器补齐占位。"""
    payload = {
        "structure_type": "argumentative",
        "chapter_count": 4,
        "chapter_words": 2500,
        "section_titles": ["一", "二"],  # 只给了 2 个,应被补齐到 4
        "section_outlines": ["aa"],
    }
    llm = FakeLLMService([json.dumps(payload, ensure_ascii=False)])
    analyzer = ArticleTopicAnalyzer(llm_service=llm)
    out = await analyzer.analyze("观点文", "梗概")
    assert out.chapter_count == 4
    assert len(out.section_titles) == 4
    assert len(out.section_outlines) == 4


@pytest.mark.asyncio
async def test_narrative_clamps_chapter_count_even_if_llm_lies():
    """LLM 声称 narrative 但给了 3 章 → 分析器强制归 1 章。"""
    payload = {
        "structure_type": "narrative",
        "chapter_count": 3,
        "chapter_words": 3000,
        "section_titles": ["一", "二", "三"],
        "section_outlines": ["a", "b", "c"],
    }
    llm = FakeLLMService([json.dumps(payload, ensure_ascii=False)])
    analyzer = ArticleTopicAnalyzer(llm_service=llm)
    out = await analyzer.analyze("叙事", "")
    assert out.chapter_count == 1
    assert out.chapter_words >= 5000
