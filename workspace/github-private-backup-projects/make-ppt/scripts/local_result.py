from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parent.parent


def repo_runtime_dir(*parts: str) -> Path:
    path = REPO_ROOT / "runtime"
    for part in parts:
        path = path / part
    return path


def repo_archive_dir(*parts: str) -> Path:
    path = REPO_ROOT / "归档"
    for part in parts:
        path = path / part
    return path


def latest_archive_dir() -> Path | None:
    archive_root = repo_archive_dir()
    if not archive_root.exists():
        return None
    candidates = [path for path in archive_root.iterdir() if path.is_dir()]
    if not candidates:
        return None
    return sorted(candidates)[-1]


def create_timestamped_output_dir(output_root: Path, label: str) -> Path:
    output_dir = output_root / f"{datetime.now().strftime('%Y%m%d-%H%M%S')}-{label}"
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


def create_named_output_dir(output_root: Path, label: str) -> Path:
    output_dir = output_root / label
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


def first_existing_path(*candidates: str | Path | None) -> Path | None:
    for candidate in candidates:
        if not candidate:
            continue
        path = candidate if isinstance(candidate, Path) else Path(candidate)
        if path.exists():
            return path
    return None


def latest_matching_path(root: Path | None, pattern: str) -> Path | None:
    if root is None or not root.exists():
        return None
    matches = [path for path in root.glob(pattern) if path.exists()]
    if not matches:
        return None
    return sorted(matches)[-1]


def default_env_paths() -> list[Path]:
    home = Path.home()
    return [
        REPO_ROOT / ".env.local",
        REPO_ROOT / ".env",
        home / ".openclaw" / "workspace" / ".env.local",
        home / ".openclaw" / "workspace" / ".env",
    ]


def load_env_candidates(paths: list[Path] | None = None, override: bool = False) -> list[Path]:
    loaded: list[Path] = []
    for env_path in paths or default_env_paths():
        if not env_path.exists():
            continue
        for raw_line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[len("export ") :].strip()
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip("\"'")
            if not key:
                continue
            if override or key not in os.environ:
                os.environ[key] = value
        loaded.append(env_path)
    return loaded


def write_result_manifest(output_dir: Path, result_path: Path, **fields: Any) -> Path:
    manifest_path = output_dir / "RESULT.json"
    payload = {
        "result": str(result_path),
        "outputDir": str(output_dir),
        **{key: str(value) if isinstance(value, Path) else value for key, value in fields.items()},
    }
    manifest_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest_path
