from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable


@dataclass
class PostprocessArtifacts:
    narration_audio: Path | None = None
    normalized_narration_audio: Path | None = None
    raw_subtitle_srt: Path | None = None
    subtitle_srt: Path | None = None
    subtitle_ass: Path | None = None
    mixed_audio: Path | None = None
    final_video: Path | None = None
    extra_files: list[Path] = field(default_factory=list)


@dataclass
class PostprocessResult:
    mode: str
    final_video: Path
    subtitle_mode: str | None = None
    subtitle_backend: str | None = None
    subtitle_error: str | None = None
    artifacts: PostprocessArtifacts = field(default_factory=PostprocessArtifacts)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class PostprocessContext:
    job_id: str
    state: dict[str, Any]
    folder: Path
    final_path: Path
    duration: float
    status_callback: Callable[[str], None] | None = None

    def update_status(self, status: str) -> None:
        if self.status_callback:
            self.status_callback(status)


class PostprocessStrategy:
    mode = 'base'

    def run(self, context: PostprocessContext) -> PostprocessResult:
        raise NotImplementedError
