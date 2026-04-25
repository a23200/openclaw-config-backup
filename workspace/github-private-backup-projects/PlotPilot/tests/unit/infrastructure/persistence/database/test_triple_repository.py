import asyncio
import sqlite3
from pathlib import Path

from domain.bible.triple import Triple, SourceType
from infrastructure.persistence.database.triple_repository import TripleRepository

SCHEMA_PATH = (
    Path(__file__).resolve().parents[5] / "infrastructure" / "persistence" / "database" / "schema.sql"
)


def _build_repo(tmp_path):
    db_path = tmp_path / "triples.db"
    conn = sqlite3.connect(str(db_path))
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    conn.execute(
        "INSERT INTO novels (id, title, slug, target_chapters) VALUES ('novel-1', 'T', 'slug-triple', 0)"
    )
    conn.execute(
        """
        INSERT INTO bible_characters (id, novel_id, name, description)
        VALUES ('char-1', 'novel-1', '林昭', '主角')
        """
    )
    conn.execute(
        """
        INSERT INTO bible_locations (id, novel_id, name, description)
        VALUES ('loc-1', 'novel-1', '青云宗', '宗门')
        """
    )
    conn.commit()
    conn.close()
    return TripleRepository(str(db_path))


def test_save_uses_display_labels_from_bible(tmp_path):
    repo = _build_repo(tmp_path)
    triple = Triple(
        id="triple-1",
        novel_id="novel-1",
        subject_type="character",
        subject_id="novel-1-char-1",
        predicate="到访过",
        object_type="location",
        object_id="loc-1",
        source_type=SourceType.CHAPTER_INFERRED,
    )

    asyncio.run(repo.save(triple))

    row = repo._db.fetch_one(
        "SELECT subject, object, subject_entity_id, object_entity_id FROM triples WHERE id = ?",
        ("triple-1",),
    )
    assert row["subject"] == "林昭"
    assert row["object"] == "青云宗"
    assert row["subject_entity_id"] == "novel-1-char-1"
    assert row["object_entity_id"] == "loc-1"
