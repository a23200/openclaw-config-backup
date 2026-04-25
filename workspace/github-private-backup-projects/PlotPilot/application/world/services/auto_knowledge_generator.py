"""自动 Knowledge 生成器 - 从小说 Bible 生成初始知识图谱"""
import logging
from typing import Dict, Any
from domain.ai.services.llm_service import LLMService, GenerationConfig
from domain.ai.value_objects.prompt import Prompt
from application.ai.knowledge_llm_contract import (
    build_initial_knowledge_system_prompt,
    parse_initial_knowledge_llm_response,
    to_knowledge_service_update_dict,
)
from application.world.services.knowledge_service import KnowledgeService

logger = logging.getLogger(__name__)


class AutoKnowledgeGenerator:
    """自动 Knowledge 生成器

    根据小说标题和 Bible 内容，使用 LLM 生成：
    - premise_lock（核心梗概）
    - 初始知识三元组（facts）
    """

    def __init__(self, llm_service: LLMService, knowledge_service: KnowledgeService):
        self.llm_service = llm_service
        self.knowledge_service = knowledge_service

    async def generate_and_save(
        self,
        novel_id: str,
        title: str,
        bible_summary: str = ""
    ) -> Dict[str, Any]:
        """生成并保存初始 Knowledge

        Args:
            novel_id: 小说 ID
            title: 小说标题
            bible_summary: Bible 摘要（可选，提升生成质量）

        Returns:
            生成的 Knowledge 数据
        """
        logger.info(f"AutoKnowledgeGenerator: generating knowledge for novel '{title}' ({novel_id})")

        knowledge_data = await self._generate_knowledge_data(title, bible_summary)
        knowledge_data["premise_lock"] = self._ensure_premise_lock(
            title=title,
            bible_summary=bible_summary,
            knowledge_data=knowledge_data,
        )

        self._save_to_knowledge(novel_id, knowledge_data)

        logger.info(
            f"Knowledge generated for {novel_id}: "
            f"facts={len(knowledge_data.get('facts', []))}"
        )
        return knowledge_data

    async def _generate_knowledge_data(self, title: str, bible_summary: str) -> Dict[str, Any]:
        """使用 LLM 生成 Knowledge 数据"""

        context_section = f"\n\n**小说设定摘要：**\n{bible_summary}" if bible_summary.strip() else ""

        system_prompt = build_initial_knowledge_system_prompt()
        user_prompt = f"小说标题：《{title}》{context_section}"

        prompt = Prompt(system=system_prompt, user=user_prompt)
        config = GenerationConfig(max_tokens=2048, temperature=0.4)

        result = await self.llm_service.generate(prompt, config)

        payload, errors = parse_initial_knowledge_llm_response(result.content)
        if payload is None:
            logger.warning(
                "AutoKnowledgeGenerator: LLM 输出未通过契约校验: %s | raw=%s",
                "; ".join(errors) if errors else "unknown",
                (result.content or "")[:1200].replace("\n", "\\n"),
            )
            return {
                "version": 1,
                "premise_lock": "",
                "chapters": [],
                "facts": [],
            }

        return to_knowledge_service_update_dict(payload)

    def _ensure_premise_lock(
        self,
        *,
        title: str,
        bible_summary: str,
        knowledge_data: Dict[str, Any],
    ) -> str:
        premise_lock = str(knowledge_data.get("premise_lock", "") or "").strip()
        if premise_lock:
            return premise_lock

        facts = knowledge_data.get("facts", []) or []
        synthesized = self._synthesize_premise_from_facts(title=title, bible_summary=bible_summary, facts=facts)
        return synthesized[:4000]

    @staticmethod
    def _first_main_character_from_summary(bible_summary: str) -> str:
        summary = (bible_summary or "").strip()
        marker = "主要角色："
        if marker not in summary:
            return ""
        tail = summary.split(marker, 1)[1]
        tail = tail.split("。", 1)[0]
        first = tail.split("、", 1)[0].strip()
        return first

    def _synthesize_premise_from_facts(
        self,
        *,
        title: str,
        bible_summary: str,
        facts: list[dict],
    ) -> str:
        relationship_predicates = {"敌对", "对立", "合作", "结盟", "师承", "师徒", "追杀", "压制", "守护"}
        location_predicates = {"地图地点", "通往", "位于", "到访过", "常驻于", "发生在"}

        subject_frequency: dict[str, int] = {}
        for fact in facts:
            subject = str(fact.get("subject", "") or "").strip()
            predicate = str(fact.get("predicate", "") or "").strip()
            if subject and predicate in relationship_predicates:
                subject_frequency[subject] = subject_frequency.get(subject, 0) + 1

        protagonist = ""
        if subject_frequency:
            protagonist = max(subject_frequency.items(), key=lambda item: item[1])[0]
        if not protagonist and facts:
            protagonist = str(facts[0].get("subject", "") or "").strip()
        if not protagonist:
            protagonist = self._first_main_character_from_summary(bible_summary)

        ally = ""
        enemy = ""
        mentor = ""
        location = ""

        for fact in facts:
            subject = str(fact.get("subject", "") or "").strip()
            predicate = str(fact.get("predicate", "") or "").strip()
            obj = str(fact.get("object", "") or "").strip()
            if predicate in location_predicates and not location:
                location = subject if predicate == "地图地点" else (obj or subject)
            if protagonist and subject == protagonist:
                if predicate in {"合作", "结盟"} and obj and not ally:
                    ally = obj
                elif predicate in {"敌对", "对立", "追杀", "压制"} and obj and not enemy:
                    enemy = obj
                elif predicate in {"师承", "师徒", "守护"} and obj and not mentor:
                    mentor = obj
            if protagonist and obj == protagonist and predicate in {"敌对", "对立", "追杀", "压制"} and subject and not enemy:
                enemy = subject

        if protagonist and ally and enemy and location:
            return f"{protagonist}在{location}的秩序压迫中崛起，与{ally}结盟、与{enemy}对立，并被卷入更大的势力博弈。"
        if protagonist and enemy and location:
            return f"{protagonist}在{location}的重压下不断崛起，与{enemy}的冲突持续升级，并逐步卷入更大的权力斗争。"
        if protagonist and mentor:
            return f"{protagonist}在强敌与机缘并存的局势中崛起，并在{mentor}的影响下走向更大的冲突中心。"
        if protagonist:
            return f"{protagonist}在重压与机缘并存的局势中逐步崛起，被卷入围绕力量与秩序的更大冲突。"
        if title.strip():
            return f"《{title.strip('《》')}》围绕一名被轻视者因机缘崛起、并改写既有秩序的主线冲突展开。"
        return "一名被轻视的核心人物因机缘崛起，并被卷入围绕力量、秩序与势力博弈的主线冲突。"

    def _save_to_knowledge(self, novel_id: str, knowledge_data: Dict[str, Any]) -> None:
        """保存到 Knowledge（兼容带 version/chapters 的完整 update 字典）。"""
        premise_lock = knowledge_data.get("premise_lock", "")
        facts_data = knowledge_data.get("facts", [])

        data = {
            "version": knowledge_data.get("version", 1),
            "premise_lock": premise_lock,
            "chapters": knowledge_data.get("chapters", []),
            "facts": [
                {
                    "id": f.get("id", f"fact-{i+1:03d}"),
                    "subject": f.get("subject", ""),
                    "predicate": f.get("predicate", ""),
                    "object": f.get("object", ""),
                    "chapter_id": f.get("chapter_id"),
                    "note": f.get("note", "") or "",
                    "entity_type": f.get("entity_type"),
                    "importance": f.get("importance"),
                    "location_type": f.get("location_type"),
                    "description": f.get("description"),
                    "first_appearance": f.get("first_appearance"),
                    "related_chapters": f.get("related_chapters", []),
                    "tags": f.get("tags", []),
                    "attributes": f.get("attributes", {}),
                    "confidence": f.get("confidence"),
                    "source_type": f.get("source_type", "ai_generated"),
                    "subject_entity_id": f.get("subject_entity_id"),
                    "object_entity_id": f.get("object_entity_id"),
                }
                for i, f in enumerate(facts_data)
            ],
        }

        self.knowledge_service.update_knowledge(novel_id, data)
        logger.debug(f"Saved knowledge for {novel_id}: premise_lock={bool(premise_lock)}, facts={len(facts_data)}")
