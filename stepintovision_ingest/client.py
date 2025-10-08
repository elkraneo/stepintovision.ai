from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime
from typing import Optional

import httpx

from .models import PostRecord, WordPressPost

USER_AGENT = "StepIntoVisionIngest/0.1 (+https://stepinto.vision)"


class WordPressClient:
    """Thin wrapper around the WordPress REST API."""

    def __init__(self, base_url: str, timeout: float = 30.0) -> None:
        self.base_url = base_url.rstrip("/")
        self._client = httpx.Client(
            base_url=self.base_url,
            timeout=timeout,
            headers={"User-Agent": USER_AGENT},
        )

    def iter_posts(
        self,
        *,
        per_page: int = 50,
        status: str = "publish",
        modified_after: Optional[datetime] = None,
        max_pages: Optional[int] = None,
    ) -> Iterator[PostRecord]:
        """
        Yield public posts ordered by most recent publish date.

        Args:
            per_page: WordPress page size (max 100).
            status: WP post status to pull.
            modified_after: Only return posts modified strictly after this UTC datetime.
            max_pages: Optional hard stop in case you need partial syncs.
        """
        if per_page < 1 or per_page > 100:
            raise ValueError("per_page must be between 1 and 100")

        page = 1
        params = {
            "per_page": per_page,
            "status": status,
            "orderby": "date",
            "order": "desc",
            "_embed": "true",
        }
        if modified_after:
            params["modified_after"] = modified_after.strftime("%Y-%m-%dT%H:%M:%S")

        while True:
            page_params = params | {"page": page}
            response = self._client.get("/wp-json/wp/v2/posts", params=page_params)
            response.raise_for_status()
            payload = response.json()

            if not payload:
                break

            for item in payload:
                wp_post = WordPressPost.model_validate(item)
                yield wp_post.to_record()

            total_pages = int(response.headers.get("X-WP-TotalPages", page))
            if page >= total_pages:
                break

            page += 1
            if max_pages is not None and page > max_pages:
                break

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "WordPressClient":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()
