from application.ai.knowledge_llm_contract import parse_initial_knowledge_llm_response


def test_parse_initial_knowledge_accepts_broad_model_output():
    raw = """
    {
      "title": "宗门小废物，其实是万界帝尊",
      "genre": "玄幻爽文",
      "core_premise": "林昭在青云宗受尽轻视，却因体内沉睡力量与残月秘境传承逐步崛起，并被卷入宗门与界外势力的博弈。",
      "entities": [
        {"id": "c1", "name": "林昭", "type": "character", "role": "主角", "description": "外门弟子，身怀隐秘底牌。"},
        {"id": "c2", "name": "韩岳", "type": "character", "role": "对手", "description": "内门天骄，持续压制林昭。"}
      ],
      "relationships": [
        {"source": "c1", "relation": "敌对", "target": "c2", "description": "两人因资源与地位持续冲突。"}
      ],
      "metadata": {"tone": "爽文"}
    }
    """

    payload, errors = parse_initial_knowledge_llm_response(raw)

    assert errors == []
    assert payload is not None
    assert "林昭在青云宗受尽轻视" in payload.premise_lock
    assert len(payload.facts) >= 1
    assert payload.facts[0].subject == "林昭"
    assert payload.facts[0].predicate == "敌对"
    assert payload.facts[0].obj == "韩岳"


def test_parse_initial_knowledge_accepts_relationship_graph_edges():
    raw = """
    {
      "narrative_style": "第三人称近景爽文",
      "story_engine": {
        "core_conflict": "林昭要在青云宗秩序压迫下保住传承，并反制赵无极一系。"
      },
      "entities": [
        {"id": "hero", "name": "林昭", "type": "character"},
        {"id": "villain", "name": "赵无极", "type": "character"}
      ],
      "relationship_graph": {
        "edges": [
          {"from": "hero", "type": "敌对", "to": "villain", "note": "赵无极屡次打压林昭。"}
        ]
      }
    }
    """

    payload, errors = parse_initial_knowledge_llm_response(raw)

    assert errors == []
    assert payload is not None
    assert "林昭要在青云宗秩序压迫下保住传承" in payload.premise_lock
    assert len(payload.facts) == 1
    assert payload.facts[0].subject == "林昭"
    assert payload.facts[0].predicate == "敌对"
    assert payload.facts[0].obj == "赵无极"
