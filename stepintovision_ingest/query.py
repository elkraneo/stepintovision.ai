from __future__ import annotations

import sqlite3
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Optional

from .models import PostRecord, TermRecord
from .utils import html_to_text, normalize_whitespace


def _parse_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value)


@dataclass(slots=True)
class PostSummary:
    """Lightweight summary for list/search responses."""

    id: int
    slug: str
    title: str
    excerpt: str
    link: str
    published_at: datetime
    categories: list[TermRecord]
    tags: list[TermRecord]

    @classmethod
    def from_record(cls, record: PostRecord) -> "PostSummary":
        excerpt = record.excerpt
        if not excerpt:
            excerpt = normalize_whitespace(html_to_text(record.content_html))[:400]
        return cls(
            id=record.id,
            slug=record.slug,
            title=record.title,
            excerpt=excerpt,
            link=record.link,
            published_at=record.published_at,
            categories=record.categories,
            tags=record.tags,
        )


class ContentQuery:
    """Read-only helper layer for querying stored Step Into Vision content."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = Path(db_path)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _attach_terms(
        self, conn: sqlite3.Connection, post_ids: Iterable[int]
    ) -> Dict[int, Dict[str, List[TermRecord]]]:
        ids = list(post_ids)
        term_map: Dict[int, Dict[str, List[TermRecord]]] = defaultdict(lambda: defaultdict(list))
        if not ids:
            return term_map

        placeholders = ",".join("?" for _ in ids)
        query = f"""
            SELECT pt.post_id, t.id, t.slug, t.name, t.taxonomy, t.link, t.description
            FROM post_terms pt
            JOIN terms t ON t.id = pt.term_id
            WHERE pt.post_id IN ({placeholders})
        """
        for row in conn.execute(query, ids):
            term = TermRecord(
                id=row["id"],
                slug=row["slug"],
                name=row["name"],
                taxonomy=row["taxonomy"],
                link=row["link"],
                description=row["description"],
            )
            term_map[row["post_id"]][term.taxonomy].append(term)

        return term_map

    def _row_to_record(
        self, row: sqlite3.Row, term_map: Dict[int, Dict[str, List[TermRecord]]]
    ) -> PostRecord:
        categories = term_map[row["id"]].get("category", [])
        tags = term_map[row["id"]].get("post_tag", [])
        return PostRecord(
            id=row["id"],
            slug=row["slug"],
            title=row["title"],
            title_html=row["title_html"],
            excerpt=row["excerpt"] or "",
            excerpt_html=row["excerpt_html"] or "",
            content_html=row["content_html"],
            link=row["link"],
            guid=row["guid"],
            author_id=row["author_id"],
            author_name=row["author_name"],
            author_slug=row["author_slug"],
            author_url=row["author_url"],
            published_at=_parse_datetime(row["published_at"]),
            modified_at=_parse_datetime(row["modified_at"]),
            categories=categories,
            tags=tags,
            featured_media_url=row["featured_media_url"],
            featured_media_alt_text=row["featured_media_alt_text"],
        )

    def list_posts(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        category_slug: Optional[str] = None,
        tag_slug: Optional[str] = None,
    ) -> List[PostRecord]:
        with self._connect() as conn:
            clauses: list[str] = []
            params: list = []
            if category_slug:
                clauses.append(
                    """
                    EXISTS (
                        SELECT 1 FROM post_terms pt
                        JOIN terms t ON t.id = pt.term_id
                        WHERE pt.post_id = posts.id
                          AND t.taxonomy = 'category'
                          AND t.slug = ?
                    )
                    """
                )
                params.append(category_slug)
            if tag_slug:
                clauses.append(
                    """
                    EXISTS (
                        SELECT 1 FROM post_terms pt
                        JOIN terms t ON t.id = pt.term_id
                        WHERE pt.post_id = posts.id
                          AND t.taxonomy = 'post_tag'
                          AND t.slug = ?
                    )
                    """
                )
                params.append(tag_slug)

            where = ""
            if clauses:
                where = "WHERE " + " AND ".join(clauses)

            query = f"""
                SELECT posts.*
                FROM posts
                {where}
                ORDER BY datetime(posts.published_at) DESC
                LIMIT ? OFFSET ?
            """
            rows = conn.execute(query, (*params, limit, offset)).fetchall()
            term_map = self._attach_terms(conn, [row["id"] for row in rows])
            return [self._row_to_record(row, term_map) for row in rows]

    def get_post(self, *, post_id: Optional[int] = None, slug: Optional[str] = None) -> Optional[PostRecord]:
        if post_id is None and slug is None:
            raise ValueError("Either post_id or slug must be provided")

        with self._connect() as conn:
            if post_id is not None:
                row = conn.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
            else:
                row = conn.execute("SELECT * FROM posts WHERE slug = ?", (slug,)).fetchone()

            if row is None:
                return None

            term_map = self._attach_terms(conn, [row["id"]])
            return self._row_to_record(row, term_map)

    def search_posts(
        self,
        query: str,
        *,
        limit: int = 20,
        offset: int = 0,
    ) -> List[PostRecord]:
        like = f"%{query}%"
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT DISTINCT posts.*
                FROM posts
                LEFT JOIN post_terms pt ON pt.post_id = posts.id
                LEFT JOIN terms t ON t.id = pt.term_id
                WHERE posts.title LIKE ?
                   OR posts.excerpt LIKE ?
                   OR posts.content_html LIKE ?
                   OR t.name LIKE ?
                ORDER BY datetime(posts.published_at) DESC
                LIMIT ? OFFSET ?
                """,
                (like, like, like, like, limit, offset),
            ).fetchall()
            term_map = self._attach_terms(conn, [row["id"] for row in rows])
            return [self._row_to_record(row, term_map) for row in rows]
