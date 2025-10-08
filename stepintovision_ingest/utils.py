from __future__ import annotations

import re
from html.parser import HTMLParser
from typing import Optional


_WHITESPACE_RE = re.compile(r"\s+")


class _HTMLStripper(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._pieces: list[str] = []

    def handle_data(self, data: str) -> None:
        if data:
            self._pieces.append(data)

    def get_data(self) -> str:
        return "".join(self._pieces)


def html_to_text(value: Optional[str]) -> str:
    """Convert a snippet of HTML to plain text for indexing and summaries."""
    if not value:
        return ""
    stripper = _HTMLStripper()
    stripper.feed(value)
    return stripper.get_data()


def normalize_whitespace(value: Optional[str]) -> str:
    """Collapse repeated whitespace and trim the ends."""
    if not value:
        return ""
    return _WHITESPACE_RE.sub(" ", value).strip()
