// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "StepIntoVisionMCP",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "stepinto-swift-mcp", targets: ["StepIntoVisionMCP"])
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-argument-parser", from: "1.2.3"),
        .package(url: "https://github.com/modelcontextprotocol/swift-sdk", from: "0.1.0")
    ],
    targets: [
        .executableTarget(
            name: "StepIntoVisionMCP",
            dependencies: [
                .product(name: "ArgumentParser", package: "swift-argument-parser"),
                .product(name: "ModelContextProtocol", package: "swift-sdk")
            ],
            path: "Sources"
        ),
        .testTarget(
            name: "StepIntoVisionMCPTests",
            dependencies: ["StepIntoVisionMCP"],
            path: "Tests"
        )
    ]
)
