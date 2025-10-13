# stepintovision.ai

A TypeScript rewrite of the Step Into Vision content service inspired by the
[architecture of sosumi.ai](https://github.com/NSHipster/sosumi.ai). It ingests
the live WordPress site and serves the catalog over HTTP (REST + MCP) for local
development or Cloudflare Workers.

## Project Layout

- `src/app.ts` – Shared Hono application factory (HTTP + MCP).
- `src/index.ts` – Node.js entrypoint used for local development.
- `src/worker.ts` – Cloudflare Workers entrypoint fed by environment bindings.
- `src/lib/` – Shared domain logic for catalog storage, search, rendering, and
  ingestion helpers.
- `src/cli/ingest.ts` – CLI that fetches Step Into Vision posts and produces a
  static catalog file.
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

1. Ensure your catalog JSON is available locally (see ingestion step above).
2. Upload the catalog to Cloudflare as an environment secret so the worker can
   hydrate itself at runtime:

   ```bash
   wrangler secret put STEPINTOVISION_CATALOG < data/stepintovision.json
   ```

3. Build and deploy the worker:

   ```bash
   npm run build
   npx wrangler deploy
   ```

Regenerate Worker binding types after configuration changes with:

```bash
npm run cf-typegen
```

## MCP Clients

Choose the integration that matches your client’s capabilities.

### Option A: HTTP worker (direct HTTP clients)

Run `npm run dev` (or host the worker) so the MCP endpoint is reachable at
`http://localhost:8787/mcp`.

- **gpt5-codex CLI**

  ```toml
  [mcp_servers.stepIntoVision]
  url = "http://localhost:8787/mcp"
  ```

  Swap the URL for your deployed endpoint when hosting remotely.

### Option B: HTTP worker via `mcp-remote` (STDIO-only clients)

Some MCP clients (Companion, Claude Desktop, etc.) expect STDIO servers. Use the
official `mcp-remote` bridge to translate HTTP into STDIO.

```bash
npx -y mcp-remote http://localhost:8787/mcp
```

- **Companion app**

  1. Open Companion, click the <kbd>+</kbd> button, and choose **STDIO**.
  2. Set **Command** to `npx`.
  3. Add three separate **Arguments** rows: `-y`, `mcp-remote`,
     `http://localhost:8787/mcp`.
  4. Save. Companion should connect to the HTTP relay and list
     `listStepIntoVisionPosts`, `getStepIntoVisionPost`, and
     `searchStepIntoVisionPosts`.

## License

All rights reserved. Step Into Vision content remains the property of its
respective creators; contact the maintainers for licensing or redistribution
requests.
