from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .client import WordPressClient
from .storage import ContentStore


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch Step Into Vision posts from the WordPress REST API into SQLite.",
    )
    parser.add_argument(
        "--base-url",
        default="https://stepinto.vision",
        help="Base URL for the WordPress site (default: %(default)s).",
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=Path("data/stepinto.db"),
        help="Destination SQLite database path (default: %(default)s).",
    )
    parser.add_argument(
        "--per-page",
        type=int,
        default=50,
        help="Number of posts to request per page (1-100, default: %(default)s).",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=None,
        help="Optional maximum number of WordPress pages to fetch.",
    )
    parser.add_argument(
        "--modified-after",
        type=str,
        default=None,
        help="Only fetch posts modified after this UTC timestamp (ISO8601).",
    )
    return parser.parse_args(argv)


def _parse_modified_after(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(argv)
    modified_after = _parse_modified_after(args.modified_after)

    total_posts = 0
    buffer = []
    buffer_size = max(1, min(args.per_page, 100))

    with WordPressClient(base_url=args.base_url) as client, ContentStore(args.db) as store:
        store.initialize_schema()
        for post in client.iter_posts(
            per_page=args.per_page,
            modified_after=modified_after,
            max_pages=args.max_pages,
        ):
            buffer.append(post)
            if len(buffer) >= buffer_size:
                store.upsert_posts(buffer)
                total_posts += len(buffer)
                print(f"Stored {total_posts} posts...", file=sys.stderr)
                buffer.clear()

        if buffer:
            store.upsert_posts(buffer)
            total_posts += len(buffer)

    print(f"Ingest complete. {total_posts} posts stored at {args.db}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
