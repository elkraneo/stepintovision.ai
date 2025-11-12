# Step Into Vision MCP Server

A TypeScript-powered MCP (Model Context Protocol) server that makes Step Into Vision's visionOS development content accessible to AI assistants. Serves both REST API and MCP endpoints from a unified codebase.

> **What it does**: Fetches articles from https://stepinto.vision, converts them to AI-ready formats, and provides MCP tools/resources plus a REST API for easy access to visionOS development content.

## Quick Start

### 1. Prerequisites
- Node.js 18+ and npm 10+
- (Optional) Cloudflare account for production deployment

### 2. Install & Run Locally
```bash
git clone <repository>
cd stepintovision.ai
npm install

# Fetch latest content from Step Into Vision
npm run ingest

# Start local development server
npm run dev
```
Visit `http://localhost:8787` - serves both REST API and MCP endpoints.

### 3. Use with Claude Desktop
Add to your `claude_desktop_config.json`:
```json
{
  "mcp_servers": {
    "stepIntoVision": {
      "url": "http://localhost:8787/mcp"
    }
  }
}
```

## What You Get

### MCP Tools & Resources
- **listStepIntoVisionPosts** - Browse articles with filters
- **getStepIntoVisionPost** - Retrieve specific articles
- **searchStepIntoVisionPosts** - Full-text search
- **stepIntoVisionPost** resources - AI-ready markdown content
- **stepIntoVisionPostMeta** resources - Structured metadata

### REST API Endpoints
- `GET /` - Service metadata
- `GET /posts` - Paginated article listings
- `GET /posts/:slug` - Individual article (JSON/Markdown)
- `GET /search?q=query` - Keyword search
- `POST /mcp` - Model Context Protocol endpoint

## Deployment Options

### Option 1: Local Development (Recommended for testing)
```bash
npm run dev  # http://localhost:8787
```

### Option 2: Cloudflare Workers (Production)
**Important**: Cloudflare Workers Free tier has ~10ms CPU limit, so ingestion is disabled by default.

#### Step 1: Generate catalog locally
```bash
npm run ingest  # Creates data/stepintovision.json
```

#### Step 2: Upload to Cloudflare KV
```bash
npx wrangler kv key put catalog.json \
  --binding=STEPINTOVISION_CATALOG_KV \
  --path=data/stepintovision.json \
  --remote
```

#### Step 3: Deploy worker
```bash
npm run build
npx wrangler deploy
```

#### Alternative: Environment Variable (No KV needed)
```bash
wrangler secret put STEPINTOVISION_CATALOG < data/stepintovision.json
```

### Option 3: Self-hosted (Node.js)
Build and run the Node.js server anywhere:
```bash
npm run build
npm start
```

## Content Updates

### Manual Updates (Recommended)
```bash
# 1. Fetch new content
npm run ingest

# 2. Upload to Cloudflare (if using Workers)
npx wrangler kv key put catalog.json --binding=STEPINTOVISION_CATALOG_KV --path=data/stepintovision.json --remote

# 3. Deploy worker (if needed)
npx wrangler deploy
```

### Automatic Updates (Advanced)
Set `STEPINTOVISION_ALLOW_WORKER_INGEST=true` environment variable to enable worker-side ingestion (requires paid Cloudflare plan for sufficient CPU time).

## CLI Options

### Ingestion Control
```bash
# Basic ingestion
npm run ingest

# Custom options
npm run ingest -- --max-pages 10
npm run ingest -- --modified-after 2025-11-01
npm run ingest -- --output custom.json
```

### Development
```bash
npm run dev          # Start dev server
npm run test         # Run tests
npm run check        # Format & lint
npm run build        # Build for production
```

## MCP Client Integration

### Direct HTTP Clients
```toml
[mcp_servers.stepIntoVision]
url = "http://localhost:8787/mcp"
```

### STDIO Clients (via mcp-remote)
```bash
npx -y mcp-remote http://localhost:8787/mcp
```

## Project Structure

```
src/
├── app.ts           # Shared Hono application factory
├── index.ts         # Local Node.js entrypoint
├── worker.ts        # Cloudflare Workers entrypoint
├── lib/             # Core business logic
│   ├── mcp.ts       # MCP server implementation
│   ├── catalog/     # Catalog loading strategies
│   └── wordpress.ts # WordPress ingestion
├── cli/
│   └── ingest.ts    # Content ingestion CLI
```

## Troubleshooting

### Common Issues

**Q: Content isn't updating**
```bash
# Solution: Manual ingestion and upload
npm run ingest
npx wrangler kv key put catalog.json --binding=STEPINTOVISION_CATALOG_KV --path=data/stepintovision.json --remote
npx wrangler deploy
```

**Q: Worker ingestion is disabled**
> This is intentional! Free tier Workers have 10ms CPU limits. Use manual ingestion workflow above.

**Q: TypeScript build errors**
```bash
npm run check  # Auto-fixes formatting issues
npm run build  # Verify compilation
```

**Q: Local server not loading content**
```bash
# Ensure catalog exists locally
npm run ingest
npm run dev
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `STEPINTOVISION_ALLOW_WORKER_INGEST` | `false` | Enable worker-side ingestion (requires paid plan) |
| `STEPINTOVISION_CATALOG` | - | Fallback catalog JSON (environment binding) |
| `STEPINTOVISION_CATALOG_KV` | - | KV namespace binding for catalog storage |

## Architecture Highlights

- **Dual Interface**: Same codebase serves REST API + MCP
- **Content Processing**: HTML → Markdown + AI-ready metadata
- **Search**: Fuse.js-powered fuzzy search
- **Flexible Storage**: File-based, KV, or environment variables
- **Type Safety**: Full TypeScript with Zod validation
- **Performance Optimized**: Content digests, caching, efficient indexing

## License

All rights reserved. Step Into Vision content remains the property of its respective creators.