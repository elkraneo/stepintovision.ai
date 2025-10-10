# Step Into Vision MCP (Swift)

This directory contains a from-scratch Swift implementation of the Step Into Vision tooling.
It now includes both the ingestion CLI (`stepintovision-ingest`) and the STDIO MCP server
(`stepintovision-mcp`), so you can stay entirely within the Swift toolchain whether you're
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

The resulting binary lives at `.build/release/stepintovision-mcp`.

## Running

Stay inside the Swift toolchain for both ingestion and serving:

```bash
cd /path/to/stepintovision.ai

# Ingest the Step Into Vision catalog into SQLite
swift run --package-path swift/StepIntoVisionMCP stepintovision-ingest --db data/stepinto.db

# Then run the Swift MCP server (STDIO transport)
swift run --package-path swift/StepIntoVisionMCP stepintovision-mcp --db data/stepinto.db
```

By default the server prints a single log line when it starts. Pass `--verbose` to watch
incoming requests and other debugging output.

### Using with `gpt5-codex`

Add a new MCP server entry to your `config.toml`:

```toml
[mcp_servers.StepIntoVisionSwift]
command = "/path/to/swift/StepIntoVisionMCP/.build/release/stepintovision-mcp"
args    = ["--db", "/path/to/stepintovision.ai/data/stepinto.db"]
```

### Using with `Companion`

Companion's "Add Server" sheet can launch STDIO MCP binaries directly:

1. Click the <kbd>+</kbd> button, choose **STDIO**, and set **Command** to
   `/path/to/swift/StepIntoVisionMCP/.build/release/stepintovision-mcp`.
2. In the **Arguments** table, add two rows: `--db` and
   `/path/to/stepintovision.ai/data/stepinto.db`. Companion passes each row as a separate
   argument, so leave commas out.
3. Save to connect. The tools list should populate with `list_posts`, `get_post`, and
   `search_posts` right away.

_The Companion CLI does not yet expose the STDIO configuration flags needed for this server.
Track updates in the [Companion repository](https://github.com/mattt/Companion) if you prefer
the CLI workflow._

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
