import ArgumentParser
import Foundation

@main
struct StepIntoVisionCommand: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "stepinto-swift-mcp",
        abstract: "Serve Step Into Vision content over MCP (Swift implementation)."
    )

    @Option(name: [.customLong("db"), .customShort("d")], help: "Path to the Step Into Vision SQLite database.")
    var databasePath: String = "data/stepinto.db"

    @Flag(name: .long, help: "Print verbose debug logging to stderr.")
    var verbose: Bool = false

    func run() throws {
        let logger = Logger(isVerbose: verbose)
        let dbURL = URL(fileURLWithPath: databasePath, isDirectory: false)
        let contentStore = try ContentDatabase(path: dbURL.path, logger: logger)
        let server = try StepIntoVisionMCPServer(database: contentStore, logger: logger)
        try server.run()
    }
}
