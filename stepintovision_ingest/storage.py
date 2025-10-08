from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from .models import PostRecord, TermRecord

SCHEMA_VERSION = 1


class ContentStore:
    """Lightweight SQLite-backed persistence for blog content."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.db_path)
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._conn.row_factory = sqlite3.Row

    def close(self) -> None:
        self._conn.close()

    def initialize_schema(self) -> None:
        with self._conn:
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS posts (
                    id INTEGER PRIMARY KEY,
                    slug TEXT NOT NULL,
                    title TEXT NOT NULL,
                    title_html TEXT NOT NULL,
                    excerpt TEXT,
                    excerpt_html TEXT,
                    content_html TEXT NOT NULL,
                    link TEXT NOT NULL,
                    guid TEXT NOT NULL,
                    author_id INTEGER,
                    author_name TEXT,
                    author_slug TEXT,
                    author_url TEXT,
                    published_at TEXT NOT NULL,
                    modified_at TEXT NOT NULL,
                    featured_media_url TEXT,
                    featured_media_alt_text TEXT,
                    fetched_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS terms (
                    id INTEGER PRIMARY KEY,
                    slug TEXT NOT NULL,
                    name TEXT NOT NULL,
                    taxonomy TEXT NOT NULL,
                    link TEXT,
                    description TEXT
                );

                CREATE TABLE IF NOT EXISTS post_terms (
                    post_id INTEGER NOT NULL,
                    term_id INTEGER NOT NULL,
                    PRIMARY KEY (post_id, term_id),
                    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
                    FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE CASCADE
                );
                """
            )
            self._conn.execute(
                "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
                ("schema_version", str(SCHEMA_VERSION)),
            )

    def upsert_posts(self, posts: Iterable[PostRecord]) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._conn:
            for post in posts:
                self._upsert_single_post(post, fetched_at=now)

    def _upsert_single_post(self, post: PostRecord, *, fetched_at: str) -> None:
        self._conn.execute(
            """
            INSERT INTO posts (
                id, slug, title, title_html, excerpt, excerpt_html, content_html,
                link, guid, author_id, author_name, author_slug, author_url,
                published_at, modified_at, featured_media_url, featured_media_alt_text, fetched_at
            ) VALUES (
                :id, :slug, :title, :title_html, :excerpt, :excerpt_html, :content_html,
                :link, :guid, :author_id, :author_name, :author_slug, :author_url,
                :published_at, :modified_at, :featured_media_url, :featured_media_alt_text, :fetched_at
            )
            ON CONFLICT(id) DO UPDATE SET
                slug=excluded.slug,
                title=excluded.title,
                title_html=excluded.title_html,
                excerpt=excluded.excerpt,
                excerpt_html=excluded.excerpt_html,
                content_html=excluded.content_html,
                link=excluded.link,
                guid=excluded.guid,
                author_id=excluded.author_id,
                author_name=excluded.author_name,
                author_slug=excluded.author_slug,
                author_url=excluded.author_url,
                published_at=excluded.published_at,
                modified_at=excluded.modified_at,
                featured_media_url=excluded.featured_media_url,
                featured_media_alt_text=excluded.featured_media_alt_text,
                fetched_at=excluded.fetched_at;
            """,
            {
                "id": post.id,
                "slug": post.slug,
                "title": post.title,
                "title_html": post.title_html,
                "excerpt": post.excerpt,
                "excerpt_html": post.excerpt_html,
                "content_html": post.content_html,
                "link": post.link,
                "guid": post.guid,
                "author_id": post.author_id,
                "author_name": post.author_name,
                "author_slug": post.author_slug,
                "author_url": post.author_url,
                "published_at": post.published_at.isoformat(),
                "modified_at": post.modified_at.isoformat(),
                "featured_media_url": post.featured_media_url,
                "featured_media_alt_text": post.featured_media_alt_text,
                "fetched_at": fetched_at,
            },
        )

        self._conn.execute(
            "DELETE FROM post_terms WHERE post_id = ?",
            (post.id,),
        )

        for term in post.iter_terms():
            self._upsert_term(term)
            self._conn.execute(
                """
                INSERT OR IGNORE INTO post_terms (post_id, term_id)
                VALUES (?, ?)
                """,
                (post.id, term.id),
            )

    def _upsert_term(self, term: TermRecord) -> None:
        self._conn.execute(
            """
            INSERT INTO terms (id, slug, name, taxonomy, link, description)
            VALUES (:id, :slug, :name, :taxonomy, :link, :description)
            ON CONFLICT(id) DO UPDATE SET
                slug=excluded.slug,
                name=excluded.name,
                taxonomy=excluded.taxonomy,
                link=excluded.link,
                description=excluded.description;
            """,
            {
                "id": term.id,
                "slug": term.slug,
                "name": term.name,
                "taxonomy": term.taxonomy,
                "link": term.link,
                "description": term.description,
            },
        )

    def __enter__(self) -> "ContentStore":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()
