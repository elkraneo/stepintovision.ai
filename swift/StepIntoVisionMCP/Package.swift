// swift-tools-version: 6.1
import PackageDescription

let package = Package(
    name: "StepIntoVisionMCP",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .library(name: "StepIntoVisionMCPCore", targets: ["StepIntoVisionMCPCore"]),
        .executable(name: "stepinto-swift-mcp", targets: ["StepIntoVisionMCP"])
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-argument-parser", from: "1.6.1"),
        .package(url: "https://github.com/modelcontextprotocol/swift-sdk", from: "0.10.2"),
        .package(url: "https://github.com/apple/swift-log.git", from: "1.6.4")
    ],
    targets: [
        .systemLibrary(
            name: "SQLite3",
            path: "Sources/SQLite3",
            pkgConfig: "sqlite3",
            providers: [
                .apt(["libsqlite3-dev"])
            ]
        ),
        .target(
            name: "StepIntoVisionMCPCore",
            dependencies: [
                "SQLite3",
                .product(name: "MCP", package: "swift-sdk"),
                .product(name: "Logging", package: "swift-log")
            ],
            path: "Sources/StepIntoVisionMCPCore"
        ),
        .executableTarget(
            name: "StepIntoVisionMCP",
            dependencies: [
                "StepIntoVisionMCPCore",
                .product(name: "ArgumentParser", package: "swift-argument-parser"),
                .product(name: "Logging", package: "swift-log")
            ],
            path: "Sources/StepIntoVisionMCP"
        ),
        .testTarget(
            name: "StepIntoVisionMCPTests",
            dependencies: ["StepIntoVisionMCPCore"],
            path: "Tests"
        )
    ]
)
