# Step Into Vision MCP

This repository packages two pieces that work together:

- **`stepintovision_ingest`** – pulls published content from the Step Into Vision blog via the public WordPress REST API and stores it locally.
- **`stepintovision_mcp`** – exposes that stored content through a [Model Context Protocol](https://modelcontextprotocol.io/) server built on [`FastMCP`](https://github.com/jlowin/fastmcp).

The goal is to let anyone ingest the Step Into Vision catalog and connect it to an MCP-aware client (Claude Desktop, Cursor, etc.).

## Requirements

- Python 3.11 or newer
- A package installer (`uv` is recommended, but `pip` works as well)

## Repository Layout

- `stepintovision_ingest/` – ingestion client, models, and storage helpers
- `stepintovision_mcp/` – MCP tool definitions and CLI entry point (`stepinto-mcp`)
- `data/` – empty folder kept for your local SQLite database (ignored by git)
- `pyproject.toml` – package metadata and dependencies

## Getting Started

Follow the numbered steps below or run `./scripts/setup.sh` to automate steps 1–3.

1. **Use Python 3.11+**

   ```bash
   python3 --version  # should report 3.11 or newer
   ```

   If your default `python3` is older, install 3.11 (e.g., via `uv python install 3.11` or `pyenv`) and set `PYTHON_BIN=python3.11` for later commands.

2. **Install the project**

   ```bash
   uv pip install .
   ```

   Without `uv`, run `python3.11 -m pip install .` (or pass the interpreter you set in step 1). This installs both packages and the `stepinto-mcp` CLI.

3. **Ingest the Step Into Vision catalog**

   ```bash
   python3 -m stepintovision_ingest.ingest --db data/stepinto.db
   ```

   Use `--help` to see flags for page size, API base URL, or incremental fetches via `--modified-after`.

4. **Expose the tools to an MCP client**

   The ingestion step writes `data/stepinto.db`, which is ignored by git so everyone brings their own copy. Point the server at that file:

   ```bash
   STEPINTOVISION_DB=./data/stepinto.db stepinto-mcp
   ```

   The default transport is stdio, which is what most MCP clients expect. To host it over HTTP/SSE:

   ```bash
   STEPINTOVISION_DB=./data/stepinto.db python3.11 -m stepintovision_mcp.server \
     --transport http --host 0.0.0.0 --port 8000
   ```

   See `python3.11 -m stepintovision_mcp.server --help` for the full CLI surface.

## Available Tools

- `list_posts(limit=10, offset=0, category_slug=None, tag_slug=None)` – paginated listing of recent articles.
- `get_post(slug=None, post_id=None, include_html=False, include_text=True)` – fetch a single record.
- `search_posts(query, limit=10, offset=0, include_html=False)` – keyword search across title, excerpt, tags, and body.

All responses include canonical URLs so that downstream consumers can cite the original content.

## Publishing Notes

- Build artifacts (`*.egg-info`, `__pycache__`, local databases) are ignored via `.gitignore` so published packages stay clean.
- `pyproject.toml` already configures setuptools to include both packages. Run `python -m build` (requires `build` package) to produce wheels/sdist if you plan to upload to PyPI.
- The `data/` directory is intentionally empty in git; each user generates their own `stepinto.db`.

## Contributing

Install the optional development dependencies with:

```bash
uv pip install '.[dev]'
```

Without `uv`: `python3.11 -m pip install '.[dev]'`.

Linting is handled by [Ruff](https://docs.astral.sh/ruff/). Feel free to open issues or PRs with improvements to the ingestion pipeline or exposed tools.
