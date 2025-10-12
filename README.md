# stepintovision.ai

A TypeScript rewrite of the Step Into Vision content service inspired by the
[architecture of sosumi.ai](https://github.com/NSHipster/sosumi.ai). The project
ships two complementary toolchains:

- A Node.js / Hono worker that ingests the live site and serves the catalog over
  HTTP (REST + MCP) for local development or Cloudflare Workers.
- A Swift package (kept from the original repository) for teams that prefer a
  native STDIO MCP server.

## Project Layout

- `src/index.ts` – Hono application entrypoint (HTTP + MCP).
- `src/lib/` – Shared domain logic for catalog storage, search, rendering, and
  ingestion helpers.
- `src/cli/ingest.ts` – CLI that fetches Step Into Vision posts and produces a
  static catalog file.
- `swift/StepIntoVisionMCP/` – Swift-only ingestion + MCP server built on the
  official Model Context Protocol Swift SDK.
- `tests/` – Vitest unit tests.
- `data/` – Ignored directory that holds the generated catalog (`json` or
  SQLite) on your machine.

## TypeScript Quick Start (HTTP Worker)

### Prerequisites

- Node.js 18 or newer
- npm 10 or newer

### 1. Install dependencies

```bash
npm install
```

### 2. Ingest the catalog

Fetch Step Into Vision posts and write them to `data/stepintovision.json`:

```bash
npm run ingest
```

Use `--max-pages`, `--modified-after`, or `--output` to control pagination,
incremental syncs, and where the JSON file is written. The CLI targets
[`https://stepinto.vision`](https://stepinto.vision) by default.

### 3. Run the development server

```bash
npm run dev
```

The worker listens on `http://localhost:8787`. The root endpoint returns service
metadata; append `/mcp` for the MCP endpoint.

### 4. Call the API

- `GET /posts` – Paginated list with optional `category`, `tag`, `limit`, and
  `offset`.
- `GET /posts/:slug` – Markdown or JSON for an individual post.
- `GET /posts/id/:id` – Fetch by numeric WordPress identifier.
- `GET /search?q=vision` – Keyword search backed by Fuse.js.
- `POST /mcp` – Model Context Protocol endpoint (streaming HTTP).
- AI-readable shortcuts – Swap the production domain for
  [`https://stepintovision.ai`](https://stepintovision.ai) or hit
  `http://localhost:8787/mcp/<slug>` for Markdown-ready payloads.

### 5. Testing & quality

- `npm run test` – Vitest unit tests.
- `npm run format` – Biome formatter.
- `npm run lint` – Lint fixes.
- `npm run check` – Run formatter and linter together.

### 6. Deploy to Cloudflare Workers

```bash
npm run build
npx wrangler deploy
```

Regenerate Worker binding types after configuration changes with:

```bash
npm run cf-typegen
```

## MCP Clients

The project offers two ways to connect MCP clients: bridge the HTTP worker with
`mcp-remote`, or run the native Swift STDIO server.

### Option A: HTTP worker via `mcp-remote`

Run `npm run dev` (or deploy the worker) so the MCP endpoint is reachable at
`http://localhost:8787/mcp`.

**gpt5-codex example**

```toml
[mcp_servers.StepIntoVision]
command = "npx"
args    = ["-y", "mcp-remote", "http://localhost:8787/mcp"]
```

Point the final argument at your deployed URL when hosting remotely.

**Companion app**

1. Open Companion, click the <kbd>+</kbd> button, and choose **STDIO**.
2. Set **Command** to `npx`.
3. Add three separate **Arguments** rows: `-y`, `mcp-remote`,
   `http://localhost:8787/mcp`.
4. Save. Companion should connect to the HTTP relay and list
   `listStepIntoVisionPosts`, `getStepIntoVisionPost`, and
   `searchStepIntoVisionPosts`.

### Option B: Native Swift STDIO server

The Swift package mirrors the original repository and keeps everything in one
toolchain.

1. **Build (or fetch dependencies)**

   ```bash
   swift build --package-path swift/StepIntoVisionMCP
   ```

2. **Ingest the WordPress catalog into SQLite**

   ```bash
   swift run --package-path swift/StepIntoVisionMCP stepintovision-ingest --db data/stepinto.db
   ```

   Use `--help` for options such as `--base-url`, `--per-page`, or
   `--modified-after`.

3. **Serve the MCP tools over STDIO**

   ```bash
   swift run --package-path swift/StepIntoVisionMCP stepintovision-mcp --db data/stepinto.db
   ```

   Add `--verbose` to watch requests stream by.

4. **Connect from clients**

   - **gpt5-codex**

     ```toml
     [mcp_servers.StepIntoVisionSwift]
     command = "/path/to/stepintovision.ai/swift/StepIntoVisionMCP/.build/debug/stepintovision-mcp"
     args    = ["--db", "/path/to/stepintovision.ai/data/stepinto.db"]
     ```

   - **Companion app**

     1. Click <kbd>+</kbd>, choose **STDIO**.
     2. Set **Command** to
        `/path/to/stepintovision.ai/swift/StepIntoVisionMCP/.build/debug/stepintovision-mcp`.
     3. Add two **Arguments** rows: `--db`, then
        `/path/to/stepintovision.ai/data/stepinto.db`.
     4. Save and verify the `list_posts`, `get_post`, and `search_posts` tools
        appear in the **Tools** view.

5. **Run Swift tests when you touch the core library**

   ```bash
   swift test --package-path swift/StepIntoVisionMCP
   ```

## License

All rights reserved. Step Into Vision content remains the property of its
respective creators; contact the maintainers for licensing or redistribution
requests.
