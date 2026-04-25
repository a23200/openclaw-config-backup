from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from urllib import error, request


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import comment payloads into the 霸霸精准流量获取工具 API.")
    parser.add_argument("--api-base", default="http://127.0.0.1:8000/api", help="API base URL")
    parser.add_argument("--video-id", type=int, help="Video ID used for CSV imports")
    parser.add_argument("--file", required=True, help="Input file path, supports .json and .csv")
    return parser.parse_args()


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_csv(path: Path, video_id: int) -> dict:
    comments = []
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            comments.append(
                {
                    "platform_comment_id": row["platform_comment_id"],
                    "content": row["content"],
                    "like_count": int(row.get("like_count") or 0),
                    "reply_count": int(row.get("reply_count") or 0),
                    "comment_time": row["comment_time"],
                    "author": {
                        "platform_user_id": row["platform_user_id"],
                        "nickname": row.get("nickname") or "",
                        "profile_url": row.get("profile_url") or None,
                        "bio": row.get("bio") or None,
                        "province": row.get("province") or None,
                        "city": row.get("city") or None,
                        "follower_count": int(row.get("follower_count") or 0),
                        "following_count": int(row.get("following_count") or 0),
                        "liked_count": int(row.get("liked_count") or 0),
                    },
                }
            )
    return {"video_id": video_id, "comments": comments}


def post_payload(api_base: str, payload: dict) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        f"{api_base.rstrip('/')}/comments/import",
        method="POST",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    with request.urlopen(req) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    args = parse_args()
    path = Path(args.file)
    if not path.exists():
        raise SystemExit(f"file not found: {path}")

    if path.suffix.lower() == ".json":
        payload = load_json(path)
    elif path.suffix.lower() == ".csv":
        if args.video_id is None:
            raise SystemExit("--video-id is required for CSV imports")
        payload = load_csv(path, args.video_id)
    else:
        raise SystemExit("unsupported file type, use .json or .csv")

    try:
        result = post_payload(args.api_base, payload)
    except error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="ignore")
        raise SystemExit(f"request failed: {exc.code} {details}") from exc
    except error.URLError as exc:
        raise SystemExit(f"cannot connect to API: {exc.reason}") from exc

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
