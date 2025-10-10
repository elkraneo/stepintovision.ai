# Step Into Vision MCP (Swift)

This directory contains a from-scratch Swift implementation of the Step Into Vision tooling.
It now includes both the ingestion CLI (`stepinto-swift-ingest`) and the STDIO MCP server
(`stepinto-swift-mcp`), so you can stay entirely within the Swift toolchain whether you're
driving [`gpt5-codex`](https://github.com/OpenAI/gpt5-codex) or testing with
[`mattt/Companion`](https://github.com/mattt/Companion).

The implementation intentionally keeps dependencies to a minimum while leaning on the
official [Model Context Protocol Swift SDK](https://github.com/modelcontextprotocol/swift-sdk)
for protocol handling and [`pointfreeco/sqlite-data`](https://github.com/pointfreeco/sqlite-data)
for ergonomic SQLite access:

- [`swift-argument-parser`](https://github.com/apple/swift-argument-parser) powers the CLIs.
- [`swift-sdk`](https://github.com/modelcontextprotocol/swift-sdk) (via the `MCP` product) hosts the STDIO MCP server and provides type-safe tool registration.
- [`sqlite-data`](https://github.com/pointfreeco/sqlite-data) wraps the system SQLite so ingestion and tooling share a concise GRDB-backed layer.

## Building

```bash
cd swift/StepIntoVisionMCP
swift build -c release
```

The resulting binary lives at `.build/release/stepinto-swift-mcp`.

## Running

Stay inside the Swift toolchain for both ingestion and serving:

```bash
cd /path/to/stepintovision.ai

# Ingest the Step Into Vision catalog into SQLite
swift run --package-path swift/StepIntoVisionMCP stepinto-swift-ingest --db data/stepinto.db

# Then run the Swift MCP server (STDIO transport)
swift run --package-path swift/StepIntoVisionMCP stepinto-swift-mcp --db data/stepinto.db
```

By default the server prints a single log line when it starts. Pass `--verbose` to watch
incoming requests and other debugging output.

### Using with `gpt5-codex`

Add a new MCP server entry to your `config.toml`:

```toml
[mcp_servers.StepIntoVisionSwift]
command = "/path/to/swift/StepIntoVisionMCP/.build/release/stepinto-swift-mcp"
args    = ["--db", "/path/to/stepintovision.ai/data/stepinto.db"]
```

### Using with `Companion`

Companion speaks STDIO MCP out of the box. Point it to the compiled binary via the
`--server` flag:

```bash
companion --server \
  /path/to/swift/StepIntoVisionMCP/.build/release/stepinto-swift-mcp \
  --server-argument --db \
  --server-argument /path/to/stepintovision.ai/data/stepinto.db
```

Companion will show the three Step Into Vision tools (`list_posts`, `get_post`, and
`search_posts`) as soon as the handshake completes. Run `tools` inside the Companion prompt
to confirm registration before issuing tool calls.

## Testing

The core server lives in the `StepIntoVisionMCPCore` library target so that it can be unit
tested without spinning up the STDIO transport. Run the SwiftPM tests to exercise both the
SQLite ingestion layer and the tool handlers end-to-end:

```bash
swift test --package-path swift/StepIntoVisionMCP
```

## Feature Parity Notes

- Responses match the JSON layout produced by the prior Python implementation, including paging
  metadata and canonical URLs.
- The STDIO transport comes from the official Swift SDK, so handshake quirks with older clients
  are handled by the shared implementation.
- HTTP/SSE transports are not yet implemented in Swift; if you previously relied on those
  transports, you will need to add them or proxy through another service.

Feel free to extend this package to add more tools or transports—everything is small and
self-contained on purpose.
