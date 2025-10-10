// swift-tools-version: 6.1
import PackageDescription

let package = Package(
    name: "StepIntoVisionMCP",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .library(name: "StepIntoVisionMCPCore", targets: ["StepIntoVisionMCPCore"]),
        .executable(name: "stepintovision-ingest", targets: ["StepIntoVisionIngest"]),
        .executable(name: "stepintovision-mcp", targets: ["StepIntoVisionMCP"])
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-argument-parser", from: "1.6.1"),
        .package(url: "https://github.com/modelcontextprotocol/swift-sdk", from: "0.10.2"),
        .package(url: "https://github.com/apple/swift-log.git", from: "1.6.4"),
        .package(url: "https://github.com/pointfreeco/sqlite-data", from: "1.1.1")
    ],
    targets: [
        .target(
            name: "SnapshotShims",
            path: "Sources/SnapshotShims",
            publicHeadersPath: "include"
        ),
        .target(
            name: "StepIntoVisionMCPCore",
            dependencies: [
                "SnapshotShims",
                .product(name: "MCP", package: "swift-sdk"),
                .product(name: "Logging", package: "swift-log"),
                .product(name: "SQLiteData", package: "sqlite-data")
            ],
            path: "Sources/StepIntoVisionMCPCore",
            linkerSettings: [.linkedLibrary("sqlite3")]
        ),
        .executableTarget(
            name: "StepIntoVisionMCP",
            dependencies: [
                "StepIntoVisionMCPCore",
                .product(name: "ArgumentParser", package: "swift-argument-parser"),
                .product(name: "Logging", package: "swift-log"),
                .product(name: "SQLiteData", package: "sqlite-data")
            ],
            path: "Sources/StepIntoVisionMCP",
            linkerSettings: [.linkedLibrary("sqlite3")]
        ),
        .executableTarget(
            name: "StepIntoVisionIngest",
            dependencies: [
                "StepIntoVisionMCPCore",
                .product(name: "ArgumentParser", package: "swift-argument-parser"),
                .product(name: "Logging", package: "swift-log"),
                .product(name: "SQLiteData", package: "sqlite-data")
            ],
            path: "Sources/StepIntoVisionIngest",
            linkerSettings: [.linkedLibrary("sqlite3")]
        ),
        .testTarget(
            name: "StepIntoVisionMCPTests",
            dependencies: ["StepIntoVisionMCPCore"],
            path: "Tests"
        )
    ]
)
