#!/usr/bin/env python3
import argparse
import asyncio
import json

from outreach_pipeline import run_outreach_pipeline


def parse_args():
    parser = argparse.ArgumentParser(description="闲鱼/视频评论引流雏形")
    parser.add_argument("target_url", help="目标视频/帖子 URL")
    parser.add_argument("--account-id", default="default")
    parser.add_argument("--keyword", action="append", default=[])
    parser.add_argument("--message", required=True)
    parser.add_argument("--max-leads", type=int, default=10)
    parser.add_argument("--send", action="store_true", help="关闭 dry-run，进入发送模式")
    return parser.parse_args()


async def main():
    args = parse_args()
    result = await run_outreach_pipeline(
        account_id=args.account_id,
        target_url=args.target_url,
        intent_keywords=args.keyword,
        message_template=args.message,
        max_leads=args.max_leads,
        dry_run=not args.send,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
