from __future__ import annotations

from datetime import datetime, timezone
from html import unescape
from typing import Iterable, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from .utils import html_to_text, normalize_whitespace


def _parse_wp_datetime(value: str) -> datetime:
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


class RenderedText(BaseModel):
    rendered: str = ""
    model_config = ConfigDict(extra="ignore")


class EmbeddedAuthor(BaseModel):
    id: int
    name: str = ""
    slug: str = ""
    url: Optional[str] = None
    description: Optional[str] = None
    link: Optional[str] = None
    model_config = ConfigDict(extra="ignore")


class EmbeddedMediaDetails(BaseModel):
    source_url: Optional[str] = Field(default=None, alias="source_url")
    alt_text: Optional[str] = Field(default=None, alias="alt_text")
    model_config = ConfigDict(extra="ignore")


class EmbeddedMedia(BaseModel):
    id: int
    source_url: Optional[str] = None
    alt_text: Optional[str] = None
    model_config = ConfigDict(extra="ignore")


class EmbeddedTerm(BaseModel):
    id: int
    link: Optional[str] = None
    name: str
    slug: str
    taxonomy: str
    description: Optional[str] = None
    model_config = ConfigDict(extra="ignore")


class EmbeddedData(BaseModel):
    author: Optional[List[EmbeddedAuthor]] = None
    wp_term: Optional[List[List[EmbeddedTerm]]] = Field(default=None, alias="wp:term")
    wp_featuredmedia: Optional[List[EmbeddedMedia]] = Field(default=None, alias="wp:featuredmedia")
    model_config = ConfigDict(extra="ignore")


class WordPressPost(BaseModel):
    id: int
    date: str
    date_gmt: str
    modified: str
    modified_gmt: str
    slug: str
    status: str
    type: str
    link: str
    title: RenderedText
    content: RenderedText
    excerpt: RenderedText
    author: int
    guid: RenderedText
    embedded: Optional[EmbeddedData] = Field(default=None, alias="_embedded")
    model_config = ConfigDict(extra="ignore")

    def to_record(self) -> PostRecord:
        author = None
        if self.embedded and self.embedded.author:
            author = self.embedded.author[0]

        categories: List[TermRecord] = []
        tags: List[TermRecord] = []
        if self.embedded and self.embedded.wp_term:
            for term_group in self.embedded.wp_term:
                if not term_group:
                    continue
                taxonomy = term_group[0].taxonomy
                records = [TermRecord.from_embedded(term) for term in term_group]
                if taxonomy == "category":
                    categories.extend(records)
                elif taxonomy == "post_tag":
                    tags.extend(records)
                else:
                    # Unknown taxonomy, attach to tags for now
                    tags.extend(records)

        featured_url = None
        featured_alt_text = None
        if self.embedded and self.embedded.wp_featuredmedia:
            media = self.embedded.wp_featuredmedia[0]
            featured_url = media.source_url
            featured_alt_text = media.alt_text

        return PostRecord(
            id=self.id,
            slug=self.slug,
            title=normalize_whitespace(unescape(html_to_text(self.title.rendered))),
            title_html=self.title.rendered,
            excerpt=normalize_whitespace(unescape(html_to_text(self.excerpt.rendered))),
            excerpt_html=self.excerpt.rendered,
            content_html=self.content.rendered,
            link=self.link,
            guid=self.guid.rendered,
            author_id=author.id if author else None,
            author_name=author.name if author else None,
            author_slug=author.slug if author else None,
            author_url=author.url if author else None,
            published_at=_parse_wp_datetime(self.date_gmt),
            modified_at=_parse_wp_datetime(self.modified_gmt),
            categories=categories,
            tags=tags,
            featured_media_url=featured_url,
            featured_media_alt_text=featured_alt_text,
        )


class TermRecord(BaseModel):
    id: int
    slug: str
    name: str
    taxonomy: str
    link: Optional[str] = None
    description: Optional[str] = None
    model_config = ConfigDict(extra="ignore")

    @classmethod
    def from_embedded(cls, term: EmbeddedTerm) -> "TermRecord":
        return cls(
            id=term.id,
            slug=term.slug,
            name=term.name,
            taxonomy=term.taxonomy,
            link=term.link,
            description=term.description,
        )


class PostRecord(BaseModel):
    id: int
    slug: str
    title: str
    title_html: str
    excerpt: str
    excerpt_html: str
    content_html: str
    link: str
    guid: str
    author_id: Optional[int] = None
    author_name: Optional[str] = None
    author_slug: Optional[str] = None
    author_url: Optional[str] = None
    published_at: datetime
    modified_at: datetime
    categories: List[TermRecord]
    tags: List[TermRecord]
    featured_media_url: Optional[str] = None
    featured_media_alt_text: Optional[str] = None
    model_config = ConfigDict(extra="ignore")

    def iter_terms(self) -> Iterable[TermRecord]:
        yield from self.categories
        yield from self.tags
