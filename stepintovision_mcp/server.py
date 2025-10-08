from __future__ import annotations

import argparse
import json
import os
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Optional

import anyio
from anyio import ClosedResourceError
from anyio.streams.memory import (
    MemoryObjectReceiveStream,
    MemoryObjectSendStream,
)
from fastmcp import Context, FastMCP
from fastmcp.utilities.logging import temporary_log_level, get_logger
from fastmcp.utilities.cli import log_server_banner
from mcp.server.lowlevel.server import NotificationOptions

import mcp.types as mcp_types
from stepintovision_ingest.models import PostRecord, TermRecord
from stepintovision_ingest.query import ContentQuery, PostSummary
from stepintovision_ingest.utils import html_to_text, normalize_whitespace

DB_ENV_VAR = "STEPINTOVISION_DB"
DEFAULT_DB_PATH = Path("data/stepinto.db")


def _resolve_db_path() -> Path:
    candidate = Path(os.environ.get(DB_ENV_VAR, DEFAULT_DB_PATH))
    if not candidate.is_absolute():
        candidate = Path.cwd() / candidate
    return candidate


@lru_cache(maxsize=1)
def _get_query() -> ContentQuery:
    db_path = _resolve_db_path()
    if not db_path.exists():
        raise FileNotFoundError(
            f"Step Into Vision database not found at {db_path}. "
            "Run the ingestion script first or set STEPINTOVISION_DB."
        )
    return ContentQuery(db_path)


def _serialize_term(term: TermRecord) -> Dict[str, Any]:
    return {
        "id": term.id,
        "slug": term.slug,
        "name": term.name,
        "taxonomy": term.taxonomy,
        "link": term.link,
        "description": term.description,
    }


def _serialize_summary(record: PostRecord) -> Dict[str, Any]:
    summary = PostSummary.from_record(record)
    return {
        "id": summary.id,
        "slug": summary.slug,
        "title": summary.title,
        "excerpt": summary.excerpt,
        "url": summary.link,
        "author": record.author_name,
        "published_at": summary.published_at.isoformat(),
        "categories": [_serialize_term(term) for term in summary.categories],
        "tags": [_serialize_term(term) for term in summary.tags],
    }


def _serialize_post(record: PostRecord, *, include_html: bool, include_text: bool) -> Dict[str, Any]:
    payload = _serialize_summary(record)
    payload.update(
        {
            "guid": record.guid,
            "modified_at": record.modified_at.isoformat(),
            "author_slug": record.author_slug,
            "author_id": record.author_id,
            "author_url": record.author_url,
            "featured_media_url": record.featured_media_url,
            "featured_media_alt_text": record.featured_media_alt_text,
        }
    )
    if include_html:
        payload["content_html"] = record.content_html
    if include_text:
        payload["content_text"] = normalize_whitespace(html_to_text(record.content_html))
    return payload


server = FastMCP(
    name="StepIntoVision MCP",
    instructions=(
        "Use these tools to browse and retrieve content from the Step Into Vision blog "
        "(https://stepinto.vision). Always include the post URL in your answer."
    ),
)


@server.tool(
    description="List the most recent posts published on Step Into Vision.",
    tags={"posts", "listing"},
)
def list_posts(
    ctx: Context,
    limit: int = 10,
    offset: int = 0,
    category_slug: Optional[str] = None,
    tag_slug: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Return a paginated list of recent Step Into Vision posts.

    Args:
        ctx: MCP execution context (unused, but keeps logging available).
        limit: Maximum number of posts to return (1-50).
        offset: Number of posts to skip before collecting results.
        category_slug: Optional category slug filter (e.g., "example-code").
        tag_slug: Optional tag slug filter.
    """
    if limit < 1 or limit > 50:
        raise ValueError("limit must be between 1 and 50")

    records = _get_query().list_posts(
        limit=limit,
        offset=offset,
        category_slug=category_slug,
        tag_slug=tag_slug,
    )
    ctx.debug("Fetched %s posts (offset=%s)", len(records), offset)
    return {
        "count": len(records),
        "items": [_serialize_summary(record) for record in records],
        "paging": {
            "limit": limit,
            "offset": offset,
            "next_offset": offset + len(records),
        },
        "filters": {
            "category_slug": category_slug,
            "tag_slug": tag_slug,
        },
    }


@server.tool(
    description="Fetch a specific Step Into Vision post by slug or numeric ID.",
    tags={"posts", "detail"},
)
def get_post(
    ctx: Context,
    slug: Optional[str] = None,
    post_id: Optional[int] = None,
    include_html: bool = False,
    include_text: bool = True,
) -> Dict[str, Any]:
    """
    Retrieve a single post.

    Args:
        ctx: Execution context for logging.
        slug: WordPress slug (preferred).
        post_id: Numeric WordPress post ID.
        include_html: Set true to include the raw HTML body.
        include_text: Set true to include a plaintext version of the content.
    """
    if slug is None and post_id is None:
        raise ValueError("Either slug or post_id must be provided")

    record = _get_query().get_post(post_id=post_id, slug=slug)
    if record is None:
        raise ValueError("Post not found")

    ctx.info("Retrieved post %s (%s)", record.slug, record.id)
    return _serialize_post(record, include_html=include_html, include_text=include_text)


@server.tool(
    description="Search Step Into Vision posts by keyword.",
    tags={"posts", "search"},
)
def search_posts(
    ctx: Context,
    query: str,
    limit: int = 10,
    offset: int = 0,
    include_html: bool = False,
) -> Dict[str, Any]:
    """
    Perform a simple substring search across titles, excerpts, tags, and content.

    Args:
        ctx: Execution context.
        query: Search string (minimum 2 characters).
        limit: Maximum posts to return.
        offset: Skip this many matches.
        include_html: Include HTML bodies in results.
    """
    if len(query.strip()) < 2:
        raise ValueError("query must be at least 2 characters")
    if limit < 1 or limit > 20:
        raise ValueError("limit must be between 1 and 20")

    records = _get_query().search_posts(query, limit=limit, offset=offset)
    ctx.debug("Search '%s' returned %s posts", query, len(records))

    return {
        "query": query,
        "count": len(records),
        "items": [
            _serialize_post(record, include_html=include_html, include_text=not include_html)
            for record in records
        ],
        "paging": {
            "limit": limit,
            "offset": offset,
            "next_offset": offset + len(records),
        },
    }


def main(argv: Optional[list[str]] = None) -> None:
    """Entry point for running the MCP server."""
    parser = argparse.ArgumentParser(
        description="Run the Step Into Vision MCP server.",
    )
    parser.add_argument(
        "--transport",
        choices=["stdio", "http", "sse", "streamable-http"],
        default="stdio",
        help="Transport to use (default: stdio).",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Host/IP for HTTP-based transports.",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Port for HTTP-based transports.",
    )
    parser.add_argument(
        "--show-banner",
        action="store_true",
        default=False,
        help="Display the FastMCP startup banner.",
    )
    args = parser.parse_args(argv)

    run_kwargs: Dict[str, Any] = {"transport": args.transport, "show_banner": args.show_banner}
    if args.transport in {"http", "sse", "streamable-http"}:
        run_kwargs["host"] = args.host
        run_kwargs["port"] = args.port

    if args.transport == "stdio":
        anyio.run(_run_stdio_compat, run_kwargs)
    else:
        server.run(**run_kwargs)


async def _run_stdio_compat(run_kwargs: Dict[str, Any]) -> None:
    """Run the server using a compat stdio transport that tolerates pre-v1.1 clients."""

    show_banner = run_kwargs.pop("show_banner", False)
    log_level = run_kwargs.pop("log_level", None)

    async with _compat_stdio_server() as (read_stream, write_stream):
        if show_banner:
            log_server_banner(server=server, transport="stdio")

        logger = get_logger(__name__)
        with temporary_log_level(log_level):
            logger.info("Starting MCP server %r with transport 'stdio'", server.name)
            await server._mcp_server.run(
                read_stream,
                write_stream,
                server._mcp_server.create_initialization_options(
                    NotificationOptions(tools_changed=True)
                ),
            )


@asynccontextmanager
async def _compat_stdio_server():
    """
    Modified copy of mcp.server.stdio.stdio_server that tolerates missing protocolVersion.
    """
    from io import TextIOWrapper
    import sys

    from anyio.streams.memory import MemoryObjectSendStream
    from mcp.shared.message import SessionMessage

    stdin = anyio.wrap_file(TextIOWrapper(sys.stdin.buffer, encoding="utf-8"))
    stdout = anyio.wrap_file(TextIOWrapper(sys.stdout.buffer, encoding="utf-8"))

    read_stream_writer, read_stream = anyio.create_memory_object_stream(0)
    write_stream, write_stream_reader = anyio.create_memory_object_stream(0)

    async def stdin_reader():
        try:
            async with read_stream_writer:
                async for line in stdin:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        message = _parse_message_with_protocol(line)
                    except Exception as exc:
                        await read_stream_writer.send(exc)
                        continue
                    session_message = SessionMessage(message)
                    await read_stream_writer.send(session_message)
        except ClosedResourceError:
            await anyio.lowlevel.checkpoint()

    async def stdout_writer():
        try:
            async with write_stream_reader:
                async for session_message in write_stream_reader:
                    json_payload = session_message.message.model_dump_json(
                        by_alias=True, exclude_none=True
                    )
                    await stdout.write(json_payload + "\n")
                    await stdout.flush()
        except ClosedResourceError:
            await anyio.lowlevel.checkpoint()

    async with anyio.create_task_group() as tg:
        tg.start_soon(stdin_reader)
        tg.start_soon(stdout_writer)
        try:
            yield read_stream, write_stream
        finally:
            await read_stream.aclose()
            await write_stream.aclose()


def _parse_message_with_protocol(line: str) -> mcp_types.JSONRPCMessage | None:
    try:
        message = mcp_types.JSONRPCMessage.model_validate_json(line)
    except Exception as original_exc:
        message = _build_initialize_message_from_raw(line, original_exc)

    root = getattr(message, "root", None)
    if isinstance(root, mcp_types.JSONRPCRequest) and root.method == "initialize":
        params = root.params
        if isinstance(params, dict):
            if "protocolVersion" not in params:
                root.params["protocolVersion"] = str(mcp_types.LATEST_PROTOCOL_VERSION)
    return message


def _build_initialize_message_from_raw(line: str, original_exc: Exception) -> mcp_types.JSONRPCMessage:
    try:
        raw = json.loads(line)
    except json.JSONDecodeError:
        raise original_exc

    if isinstance(raw, dict) and raw.get("method") == "initialize":
        params = raw.setdefault("params", {})
        if isinstance(params, dict) and "protocolVersion" not in params:
            params["protocolVersion"] = str(mcp_types.LATEST_PROTOCOL_VERSION)
        try:
            init_params = mcp_types.InitializeRequestParams.model_validate(params)
            init_request = mcp_types.InitializeRequest.model_validate(
                {
                    "jsonrpc": raw.get("jsonrpc", "2.0"),
                    "id": raw.get("id"),
                    "params": init_params,
                }
            )
            return mcp_types.JSONRPCMessage.model_validate(
                {
                    "jsonrpc": "2.0",
                    "id": init_request.id,
                    "method": "initialize",
                    "params": init_params.model_dump(),
                }
            )
        except Exception:
            raise original_exc
    raise original_exc


if __name__ == "__main__":
    main()
