"""初始知识图谱：LLM 输出契约、解析校验与 OpenAI-style tool 定义。

设计要点：
- **校验即工具**：当前 `LLMService` 仅有文本 `generate`；模型仍输出 JSON 字符串，服务端用本模块做
  严格解析（等价于「执行 tool 参数校验」）。日后 provider 支持 function calling 时，可把
  `initial_knowledge_openai_function_tool()` 交给网关，参数形状保持一致。
- **禁止多余字段**：`extra='forbid'`，丢弃模型捏造的 `provenance`、`source_type`（写入时由服务端统一标为 ai_generated）等。
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Tuple

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, ValidationError

from application.ai.llm_json_extract import parse_llm_json_to_dict

# ---------------------------------------------------------------------------
# 与 LLM 约定的形状（字段越少越好，其余由持久化层补全）
# ---------------------------------------------------------------------------


class LlmInitialKnowledgeFact(BaseModel):
    """单条事实：仅允许 id / subject / predicate / object / note。"""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=256)
    subject: str = Field(default="", max_length=4000)
    predicate: str = Field(default="", max_length=512)
    obj: str = Field(
        default="",
        max_length=4000,
        validation_alias=AliasChoices("object", "obj"),
        serialization_alias="object",
    )
    note: str = Field(default="", max_length=4000)


class LlmInitialKnowledgePayload(BaseModel):
    """根对象：梗概 + 事实列表。"""

    model_config = ConfigDict(extra="forbid")

    premise_lock: str = Field(default="", max_length=4000)
    facts: List[LlmInitialKnowledgeFact] = Field(default_factory=list, max_length=50)


# ---------------------------------------------------------------------------
# 提示词（角色 + 契约说明；与校验模型同源维护）
# ---------------------------------------------------------------------------

_INITIAL_KNOWLEDGE_INSTRUCTIONS = """你是专业的小说知识图谱构建助手。根据小说标题和设定，生成核心知识。

**字段契约（多一字段即非法，不要输出 provenance、source_type、chapter_element_id 等）：**
- premise_lock: string，一句话核心梗概（约 50～100 字）
- facts: array，每项仅含 id, subject, predicate, object, note（note 可省略或空字符串）
- id 使用稳定前缀如 fact-001、fact-002
- object 为宾语字符串（JSON 键名必须是 "object"）
- 提取 5～10 条核心设定三元组：主要角色身份、核心地点、关键规则/能力；只写确定设定，不要推测

**严禁输出这些顶层字段：title、genre、style、narrative_style、entities、relationship_graph、story_engine、metadata、opening_state、chapter_hooks。**

唯一合法示例：
{
  "premise_lock": "林昭在青云宗受尽轻视，却因体内沉睡力量与残月秘境传承逐步崛起，并被卷入宗门与界外势力的博弈。",
  "facts": [
    {
      "id": "fact-001",
      "subject": "林昭",
      "predicate": "敌对",
      "object": "韩岳",
      "note": "两人因资源与地位冲突持续对立。"
    }
  ]
}

**source_type、推断溯源由服务端写入；模型不要编造。**

请按照以下 json 格式输出，必须能被 Python `json.loads` 直接解析。只给出 JSON，不作解释，不作答：
```json
{
  "premise_lock": "",
  "facts": []
}
```"""


def _coerce_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float, bool)):
        return str(value).strip()
    if isinstance(value, dict):
        for key in (
            "name",
            "title",
            "text",
            "content",
            "summary",
            "description",
            "label",
            "value",
            "role",
            "type",
            "category",
            "kind",
            "identity",
            "id",
        ):
            text = _coerce_text(value.get(key))
            if text:
                return text
        return ""
    if isinstance(value, (list, tuple)):
        parts: list[str] = []
        for item in value:
            text = _coerce_text(item)
            if text:
                parts.append(text)
            if len(parts) >= 5:
                break
        return "；".join(parts)
    return ""


def _pick_text(data: Dict[str, Any], *keys: str) -> str:
    for key in keys:
        if key in data:
            text = _coerce_text(data.get(key))
            if text:
                return text
    return ""


def _normalize_premise_lock(data: Dict[str, Any]) -> str:
    direct = _pick_text(
        data,
        "premise_lock",
        "core_premise",
        "premise",
        "logline",
        "story_summary",
        "summary",
        "initial_arc_seed",
        "hook",
    )
    if direct:
        return direct[:4000]

    story_engine = data.get("story_engine")
    if isinstance(story_engine, dict):
        pieces = [
            _pick_text(story_engine, "core_premise", "premise", "summary", "logline"),
            _pick_text(story_engine, "core_conflict", "central_conflict", "main_conflict"),
            _pick_text(story_engine, "driving_question", "main_goal", "story_goal"),
        ]
        text = "；".join(piece for piece in pieces if piece)
        if text:
            return text[:4000]

    opening_state = data.get("opening_state")
    progression_design = data.get("progression_design")
    if isinstance(opening_state, dict) or isinstance(progression_design, dict):
        pieces = [
            _coerce_text(opening_state),
            _coerce_text(progression_design),
        ]
        text = "；".join(piece for piece in pieces if piece)
        if text:
            return text[:4000]
    return ""


def _build_entity_name_lookup(data: Dict[str, Any]) -> Dict[str, str]:
    lookup: Dict[str, str] = {}
    for key in ("entities", "characters", "locations"):
        items = data.get(key)
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            name = _pick_text(item, "name", "title", "label")
            if not name:
                continue
            for raw_key in ("id", "entity_id", "key", "code", "slug", "name"):
                raw = _coerce_text(item.get(raw_key))
                if raw:
                    lookup[raw] = name
    return lookup


def _normalize_relation_facts(data: Dict[str, Any]) -> List[Dict[str, str]]:
    lookup = _build_entity_name_lookup(data)
    raw_items: List[Any] = []

    for key in ("facts", "relationships", "triples", "relations", "links", "edges"):
        items = data.get(key)
        if isinstance(items, list):
            raw_items.extend(items)

    graph = data.get("relationship_graph")
    if isinstance(graph, list):
        raw_items.extend(graph)
    elif isinstance(graph, dict):
        for key in ("edges", "relationships", "relations", "links", "items"):
            items = graph.get(key)
            if isinstance(items, list):
                raw_items.extend(items)

    facts: List[Dict[str, str]] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        subject = _pick_text(item, "subject", "source", "from", "src", "a", "left")
        predicate = _pick_text(item, "predicate", "relation", "type", "label", "relationship")
        obj = _pick_text(item, "object", "obj", "target", "to", "dst", "b", "right")
        note = _pick_text(item, "note", "description", "reason", "context", "summary")

        subject = lookup.get(subject, subject)
        obj = lookup.get(obj, obj)

        if subject and predicate and obj:
            facts.append(
                {
                    "subject": subject[:4000],
                    "predicate": predicate[:512],
                    "object": obj[:4000],
                    "note": note[:4000],
                }
            )
    return facts


def _normalize_entity_facts(data: Dict[str, Any]) -> List[Dict[str, str]]:
    facts: List[Dict[str, str]] = []
    for key in ("entities", "characters", "locations"):
        items = data.get(key)
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            name = _pick_text(item, "name", "title", "label")
            if not name:
                continue

            role = _pick_text(item, "role", "identity", "position")
            entity_type = _pick_text(item, "type", "category", "kind")
            desc = _pick_text(item, "description", "summary", "profile", "details")

            predicate = "设定"
            obj = desc
            if role:
                predicate = "身份"
                obj = role
            elif entity_type:
                predicate = "类型"
                obj = entity_type

            if not obj:
                continue

            facts.append(
                {
                    "subject": name[:4000],
                    "predicate": predicate[:512],
                    "object": obj[:4000],
                    "note": desc[:4000] if desc and desc != obj else "",
                }
            )
    return facts


def _normalize_initial_knowledge_dict(data: Dict[str, Any]) -> Dict[str, Any]:
    premise_lock = _normalize_premise_lock(data)
    facts = _normalize_relation_facts(data)
    if not facts:
        facts = _normalize_entity_facts(data)

    normalized_facts = []
    seen: set[tuple[str, str, str]] = set()
    for idx, fact in enumerate(facts, start=1):
        subject = _coerce_text(fact.get("subject"))
        predicate = _coerce_text(fact.get("predicate"))
        obj = _coerce_text(fact.get("object"))
        note = _coerce_text(fact.get("note"))
        if not (subject and predicate and obj):
            continue
        key = (subject, predicate, obj)
        if key in seen:
            continue
        seen.add(key)
        normalized_facts.append(
            {
                "id": f"fact-{idx:03d}",
                "subject": subject[:4000],
                "predicate": predicate[:512],
                "object": obj[:4000],
                "note": note[:4000],
            }
        )
        if len(normalized_facts) >= 12:
            break

    return {
        "premise_lock": premise_lock[:4000],
        "facts": normalized_facts,
    }


def build_initial_knowledge_system_prompt() -> str:
    """供 AutoKnowledgeGenerator 等拼接 system prompt（单一真源）。"""
    return _INITIAL_KNOWLEDGE_INSTRUCTIONS


def initial_knowledge_openai_function_tool() -> Dict[str, Any]:
    """OpenAI Chat Completions `tools[]` 中单条 function 定义（parameters 来自 Pydantic schema）。"""
    schema = LlmInitialKnowledgePayload.model_json_schema(mode="validation")
    return {
        "type": "function",
        "function": {
            "name": "submit_initial_knowledge",
            "description": (
                "提交初始故事知识：梗概锁定 premise_lock 与核心 facts。"
                "禁止包含 provenance、source_type、chapter_element_id；仅允许契约内字段。"
            ),
            "parameters": schema,
        },
    }


# ---------------------------------------------------------------------------
# 从模型原始文本解析 → 校验
# ---------------------------------------------------------------------------


def parse_json_from_response(rsp: str):
    """从LLM响应中解析JSON，支持```json包裹格式"""
    pattern = r"```json(.*?)```"
    rsp_json = None
    try:
        match = re.search(pattern, rsp, re.DOTALL)
        if match is not None:
            try:
                rsp_json = json.loads(match.group(1).strip())
            except:
                pass
        else:
            rsp_json = json.loads(rsp)
        return rsp_json
    except json.JSONDecodeError as e:
        try:
            match = re.search(r"\{(.*?)\}", rsp, re.DOTALL)
            if match:
                content = "{" + match.group(1) + "}"
                return json.loads(content)
        except:
            pass
        raise e


def parse_initial_knowledge_llm_response(
    raw: str,
) -> Tuple[Optional[LlmInitialKnowledgePayload], List[str]]:
    """解析并校验 LLM 返回文本。成功返回 (payload, [])；失败返回 (None, [人类可读错误…])。"""
    try:
        data = parse_json_from_response(raw)
    except json.JSONDecodeError as e:
        return None, [f"JSON parse failed: {str(e)}"]

    try:
        payload = LlmInitialKnowledgePayload.model_validate(data)
        return payload, []
    except ValidationError as e:
        normalized = _normalize_initial_knowledge_dict(data)
        try:
            payload = LlmInitialKnowledgePayload.model_validate(normalized)
            return payload, []
        except ValidationError:
            err_list = e.errors()
            msg = "; ".join(
                f"{'/'.join(str(x) for x in err.get('loc', ()))}: {err.get('msg', '')}"
                for err in err_list[:12]
            )
            return None, [msg or str(e)]


def to_knowledge_service_update_dict(
    payload: LlmInitialKnowledgePayload,
    *,
    version: int = 1,
    source_type: str = "ai_generated",
) -> Dict[str, Any]:
    """转为 `KnowledgeService.update_knowledge` 所需字典（补全 chapter_id、统一来源）。"""
    facts: List[Dict[str, Any]] = []
    for i, f in enumerate(payload.facts):
        facts.append(
            {
                "id": f.id or f"fact-{i+1:03d}",
                "subject": f.subject,
                "predicate": f.predicate,
                "object": f.obj,
                "chapter_id": None,
                "note": f.note or "",
                "source_type": source_type,
            }
        )
    return {
        "version": version,
        "premise_lock": payload.premise_lock,
        "chapters": [],
        "facts": facts,
    }
