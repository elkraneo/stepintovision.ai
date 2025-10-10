import ArgumentParser
import Foundation
import Logging
import StepIntoVisionMCPCore

@main
@available(macOS 10.15, macCatalyst 13, iOS 13, tvOS 13, watchOS 6, *)
struct StepIntoVisionCommand: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "stepintovision-mcp",
        abstract: "Serve Step Into Vision content over MCP (Swift implementation)."
    )

    @Option(name: [.customLong("db"), .customShort("d")], help: "Path to the Step Into Vision SQLite database.")
    var databasePath: String = "data/stepinto.db"

    @Flag(name: .long, help: "Print verbose debug logging to stderr.")
    var verbose: Bool = false

    mutating func run() async throws {
        Self.bootstrapLogging()
        let logger = StepIntoVisionMCPCore.Logger(isVerbose: verbose)
        let dbURL = URL(fileURLWithPath: databasePath, isDirectory: false)
        let contentStore = try ContentDatabase(path: dbURL.path, logger: logger)
        let server = await StepIntoVisionMCPServer(database: contentStore, logger: logger)
        try await server.run()
    }

    private static func bootstrapLogging() {
        struct BootstrapToken {
            static let once: Void = {
                LoggingSystem.bootstrap { label in
                    var handler = StreamLogHandler.standardError(label: label)
                    handler.logLevel = .trace
                    return handler
                }
            }()
        }
        _ = BootstrapToken.once
    }
}
