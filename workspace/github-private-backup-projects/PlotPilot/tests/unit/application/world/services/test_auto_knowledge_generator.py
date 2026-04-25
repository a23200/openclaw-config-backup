from application.world.services.auto_knowledge_generator import AutoKnowledgeGenerator


def test_auto_knowledge_generator_synthesizes_premise_from_facts():
    generator = AutoKnowledgeGenerator(llm_service=None, knowledge_service=None)

    premise = generator._ensure_premise_lock(
        title="《宗门小废物，其实是万界帝尊》",
        bible_summary="主要角色：林昭、沈清漪、韩岳。重要地点：青云宗、残月秘境。",
        knowledge_data={
            "premise_lock": "",
            "facts": [
                {"subject": "林昭", "predicate": "合作", "object": "沈清漪"},
                {"subject": "林昭", "predicate": "敌对", "object": "韩岳"},
                {"subject": "残月秘境", "predicate": "通往", "object": "青云宗"},
            ],
        },
    )

    assert "林昭" in premise
    assert "沈清漪" in premise
    assert "韩岳" in premise
    assert "青云宗" in premise or "残月秘境" in premise
