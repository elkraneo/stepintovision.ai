import ArgumentParser
import Foundation
import Logging
import StepIntoVisionMCPCore

@available(macOS 10.15, macCatalyst 13, iOS 13, tvOS 13, watchOS 6, *)
struct StepIntoVisionIngestCommand: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "stepintovision-ingest",
        abstract: "Fetch Step Into Vision posts from WordPress into SQLite using Swift."
    )

    @Option(name: [.customLong("base-url"), .customShort("u")], help: "Base URL for the WordPress site.")
    var baseURLString: String = "https://stepinto.vision"

    @Option(name: [.customLong("db"), .customShort("d")], help: "Destination SQLite database path.")
    var databasePath: String = "data/stepinto.db"

    @Option(name: .long, help: "Number of posts to request per page (1-100).")
    var perPage: Int = 50

    @Option(name: .long, help: "Optional maximum number of pages to fetch.")
    var maxPages: Int?

    @Option(name: .long, help: "Only fetch posts modified after this ISO8601 timestamp (UTC).")
    var modifiedAfter: String?

    @Flag(name: .long, help: "Print verbose logging to stderr.")
    var verbose: Bool = false

    mutating func run() async throws {
        Self.bootstrapLogging()
        let logger = Logger(isVerbose: verbose)

        guard let baseURL = URL(string: baseURLString) else {
            throw ValidationError("base-url must be a valid URL")
        }

        let normalizedPerPage = min(max(perPage, 1), 100)
        let modifiedAfterDate = try parseModifiedAfter()

        let database = try ContentDatabase(path: databasePath, mode: .readWrite, logger: logger)
        try database.initializeSchema()

        let client = WordPressClient(baseURL: baseURL, logger: logger)

        var page = 1
        var stored = 0
        while true {
            let result = try await client.fetchPosts(perPage: normalizedPerPage, page: page, modifiedAfter: modifiedAfterDate)
            if result.posts.isEmpty {
                break
            }
            try database.upsert(posts: result.posts)
            stored += result.posts.count
            logger.info("Stored \(stored) posts (page \(page))")

            if let maxPages, page >= maxPages {
                break
            }
            if page >= result.totalPages {
                break
            }
            page += 1
        }

        logger.info("Ingest complete. \(stored) posts stored at \(databasePath)")
    }

    private func parseModifiedAfter() throws -> Date? {
        guard let modifiedAfter, !modifiedAfter.isEmpty else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: modifiedAfter) {
            return date
        }
        formatter.formatOptions = [.withInternetDateTime]
        guard let fallback = formatter.date(from: modifiedAfter) else {
            throw ValidationError("modified-after must be a valid ISO8601 timestamp")
        }
        return fallback
    }

    private static func bootstrapLogging() {
        struct BootstrapToken {
            static let once: Void = {
                LoggingSystem.bootstrap { label in
                    var handler = StreamLogHandler.standardError(label: label)
                    handler.logLevel = .info
                    return handler
                }
            }()
        }
        _ = BootstrapToken.once
    }
}

StepIntoVisionIngestCommand.main()
