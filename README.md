# stepintovision.ai

A TypeScript rewrite of the Step Into Vision content service inspired by the
[architecture of sosumi.ai](https://github.com/NSHipster/sosumi.ai).

The project ingests the Step Into Vision WordPress site and exposes the catalog
as:

- A REST API built with [Hono](https://hono.dev) that runs locally or on
  serverless platforms such as Cloudflare Workers.
- An MCP server with tools and resources tailored to Step Into Vision content.

## Project Layout

- `src/index.ts` – Hono application entrypoint (HTTP + MCP).
- `src/lib/` – Shared domain logic for catalog storage, search, rendering, and
  ingestion helpers.
- `src/cli/ingest.ts` – CLI that fetches Step Into Vision posts and produces a
  static catalog file.
- `tests/` – Vitest unit tests.
- `data/` – Ignored directory where the generated catalog is stored locally.

## Getting Started

### Prerequisites

- Node.js 18 or newer
- npm 10 or newer

### Install Dependencies

```bash
npm install
```

### Ingest Content

Fetch Step Into Vision posts and write them to `data/stepintovision.json`:

```bash
npm run ingest
```

The CLI is dedicated to the production site at
[`https://stepinto.vision`](https://stepinto.vision). Optional flags are limited
to `--max-pages`, `--modified-after`, and `--output` for controlling pagination,
incremental syncs, and the destination file path.

### Run the Development Server

```bash
npm run dev
```

The server listens on `http://localhost:8787` by default. The root endpoint
returns service metadata and available routes.

### Call the API

- `GET /posts` – list paginated posts with optional `category`, `tag`, `limit`,
  and `offset` query parameters.
- `GET /posts/:slug` – fetch a single post by slug. Request `text/markdown` to
  receive a Markdown rendition that includes HTML source and YAML front matter.
- `GET /posts/id/:id` – fetch a post by its numeric WordPress identifier.
- `GET /search?q=vision` – keyword search backed by Fuse.js fuzzy search.
- `POST /mcp` (Streamable HTTP) – Model Context Protocol endpoint powering the
  Step Into Vision tools. When deploying remotely be sure to append `/mcp` to
  the service URL.

### MCP Integration

Configure compatible clients to connect to the MCP endpoint directly when
self-hosting. Note the `/mcp` path segment:

```json
{
  "mcpServers": {
    "stepIntoVision": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:8787/mcp"]
    }
  }
}
```

Available MCP tools:

- `listStepIntoVisionPosts` – List recent posts with filters.
- `getStepIntoVisionPost` – Retrieve a post by slug or ID.
- `searchStepIntoVisionPosts` – Run keyword searches.

And a resource template:

- `stepintovision://post/{slug}` – Provides Markdown for a specific post with
  detailed YAML metadata and the original HTML payload.

### Testing & Quality

- `npm run test` – Execute Vitest unit tests.
- `npm run format` – Format with Biome.
- `npm run lint` – Apply lint fixes.
- `npm run check` – Run formatter and linter together.

### Deployment

The project targets Cloudflare Workers by default. Build the Worker bundle with:

```bash
npm run build
```

Then use [`wrangler`](https://developers.cloudflare.com/workers/wrangler/) to
publish:

```bash
npx wrangler deploy
```

Regenerate type definitions for Worker bindings whenever configuration changes:

```bash
npm run cf-typegen
```

## License

MIT. See [LICENSE.md](https://github.com/NSHipster/sosumi.ai/blob/main/LICENSE.md)
for the upstream template.
