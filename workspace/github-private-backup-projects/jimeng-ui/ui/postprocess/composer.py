from __future__ import annotations

from pathlib import Path


def copy_visual_master(final_path: Path, folder: Path) -> Path:
    mastered_path = folder / 'final_mastered.mp4'
    mastered_path.write_bytes(final_path.read_bytes())
    return mastered_path
