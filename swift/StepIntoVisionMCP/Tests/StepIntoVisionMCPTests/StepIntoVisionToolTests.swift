import XCTest
@testable import StepIntoVisionMCPCore
import SQLite3
import MCP

final class StepIntoVisionToolTests: XCTestCase {
    private var temporaryDirectory: URL!
    private var databaseURL: URL!
    private var database: ContentDatabase!
    private var toolResponses: StepIntoVisionToolResponses!

    override func setUpWithError() throws {
        temporaryDirectory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: temporaryDirectory, withIntermediateDirectories: true)
        databaseURL = temporaryDirectory.appendingPathComponent("stepinto-fixture.db")
        try SQLiteFixtureBuilder(url: databaseURL).build()
        database = try ContentDatabase(path: databaseURL.path, logger: Logger(isVerbose: true))
        toolResponses = StepIntoVisionToolResponses(database: database, logger: Logger(isVerbose: true))
    }

    override func tearDownWithError() throws {
        database = nil
        toolResponses = nil
        if let databaseURL, FileManager.default.fileExists(atPath: databaseURL.path) {
            try? FileManager.default.removeItem(at: databaseURL)
        }
        if let temporaryDirectory {
            try? FileManager.default.removeItem(at: temporaryDirectory)
        }
        temporaryDirectory = nil
    }

    func testListPostsReturnsNewestFirstAndProvidesPaging() throws {
        let payload = try toolResponses.listPosts(arguments: ListPostsArguments(limit: 10, offset: 0, categorySlug: nil, tagSlug: nil))
        let count = payload["count"] as? Int
        XCTAssertEqual(count, 3)

        let items = payload["items"] as? [[String: Any]]
        let slugs = items?.compactMap { $0["slug"] as? String }
        XCTAssertEqual(slugs, ["vision-update", "founders-letter", "welcome"])

        let paging = payload["paging"] as? [String: Any]
        XCTAssertEqual(paging?["offset"] as? Int, 0)
        XCTAssertEqual(paging?["next_offset"] as? Int, 3)

        let founders = items?.first { $0["slug"] as? String == "founders-letter" }
        let fallbackExcerpt = founders?["excerpt"] as? String
        XCTAssertEqual(fallbackExcerpt, "Welcome to the future of inclusive design.")
    }

    func testListPostsFiltersByCategorySlug() throws {
        let payload = try toolResponses.listPosts(arguments: ListPostsArguments(limit: nil, offset: nil, categorySlug: "product", tagSlug: nil))
        let items = payload["items"] as? [[String: Any]]
        XCTAssertEqual(items?.count, 1)
        XCTAssertEqual(items?.first?["title"] as? String, "Vision Update")

        let filters = payload["filters"] as? [String: Any]
        XCTAssertEqual(filters?["category_slug"] as? String, "product")
        XCTAssertTrue(filters?["tag_slug"] is NSNull)
    }

    func testGetPostIncludesHtmlWhenRequested() throws {
        let payload = try toolResponses.getPost(arguments: GetPostArguments(slug: "vision-update", postID: nil, includeHTML: true, includeText: false))
        XCTAssertEqual(payload["slug"] as? String, "vision-update")
        XCTAssertNotNil(payload["content_html"] as? String)
        XCTAssertNil(payload["content_text"])

        let categories = payload["categories"] as? [[String: Any]]
        XCTAssertEqual(categories?.first?["slug"] as? String, "product")
    }

    func testGetPostThrowsWhenMissingIdentifier() throws {
        XCTAssertThrowsError(try toolResponses.getPost(arguments: GetPostArguments(slug: nil, postID: nil, includeHTML: nil, includeText: nil))) { error in
            guard let toolError = error as? ToolArgumentError else {
                XCTFail("Expected ToolArgumentError, got \(error)")
                return
            }
            XCTAssertEqual(toolError.message, "Either slug or post_id must be provided")
        }
    }

    func testSearchPostsMatchesAcrossContentAndHonorsHtmlFlag() throws {
        let payload = try toolResponses.searchPosts(arguments: SearchPostsArguments(query: "Guides", limit: 5, offset: 0, includeHTML: true))
        XCTAssertEqual(payload["query"] as? String, "Guides")
        let items = payload["items"] as? [[String: Any]]
        XCTAssertEqual(items?.count, 1)
        let item = items?.first
        XCTAssertEqual(item?["slug"] as? String, "founders-letter")
        XCTAssertNotNil(item?["content_html"] as? String)
        XCTAssertNil(item?["content_text"])
    }

    func testServerRegistersToolsWithOfficialSchemas() async throws {
        let server = await StepIntoVisionMCPServer(database: database, logger: Logger(isVerbose: true))
        let definitions = server.toolDefinitionsForTesting()
        XCTAssertEqual(definitions.count, 3)
        XCTAssertEqual(Set(definitions.map(\.name)), ["list_posts", "get_post", "search_posts"])

        let listPosts = try XCTUnwrap(definitions.first(where: { $0.name == "list_posts" }))
        let schemaObject = try XCTUnwrap(listPosts.inputSchema.objectValue)
        XCTAssertEqual(schemaObject["type"], .string("object"))
        let properties = try XCTUnwrap(schemaObject["properties"]?.objectValue)
        XCTAssertNotNil(properties["limit"])
        XCTAssertEqual(listPosts.annotations.readOnlyHint, true)

        let searchPosts = try XCTUnwrap(definitions.first(where: { $0.name == "search_posts" }))
        let searchSchema = try XCTUnwrap(searchPosts.inputSchema.objectValue)
        let required = try XCTUnwrap(searchSchema["required"]?.arrayValue)
        XCTAssertEqual(required, [.string("query")])
    }

    func testServerToolCallProducesJSONResource() async throws {
        let server = await StepIntoVisionMCPServer(database: database, logger: Logger(isVerbose: true))
        let result = try await server.callToolForTesting(name: "list_posts", arguments: [:] as [String: Value])
        XCTAssertEqual(result.isError ?? false, false)
        XCTAssertEqual(result.content.count, 2)

        guard case let .resource(uri, mimeType, text) = result.content[1] else {
            return XCTFail("Expected resource content for JSON payload")
        }

        XCTAssertEqual(mimeType, "application/json")
        XCTAssertTrue(uri.hasPrefix("data:application/json;base64,"))

        let jsonData = try XCTUnwrap(text?.data(using: .utf8))
        let decoded = try JSONSerialization.jsonObject(with: jsonData) as? [String: Any]
        XCTAssertEqual(decoded?["count"] as? Int, 3)
    }
}

private struct SQLiteFixtureBuilder {
    let url: URL

    func build() throws {
        var handle: OpaquePointer?
        let flags = SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX
        guard sqlite3_open_v2(url.path, &handle, flags, nil) == SQLITE_OK else {
            throw SQLiteFixtureError.creationFailed
        }
        defer { sqlite3_close(handle) }

        try exec(db: handle, sql: "PRAGMA journal_mode=WAL;")
        try exec(db: handle, sql: """
            CREATE TABLE posts (
                id INTEGER PRIMARY KEY,
                slug TEXT NOT NULL,
                title TEXT NOT NULL,
                title_html TEXT NOT NULL,
                excerpt TEXT,
                excerpt_html TEXT,
                content_html TEXT NOT NULL,
                link TEXT NOT NULL,
                guid TEXT NOT NULL,
                author_id INTEGER,
                author_name TEXT,
                author_slug TEXT,
                author_url TEXT,
                published_at TEXT NOT NULL,
                modified_at TEXT NOT NULL,
                featured_media_url TEXT,
                featured_media_alt_text TEXT
            );
        """)

        try exec(db: handle, sql: """
            CREATE TABLE terms (
                id INTEGER PRIMARY KEY,
                slug TEXT NOT NULL,
                name TEXT NOT NULL,
                taxonomy TEXT NOT NULL,
                link TEXT,
                description TEXT
            );
        """)

        try exec(db: handle, sql: """
            CREATE TABLE post_terms (
                post_id INTEGER NOT NULL,
                term_id INTEGER NOT NULL
            );
        """)

        try insertFixtures(db: handle)
    }

    private func insertFixtures(db handle: OpaquePointer?) throws {
        try exec(db: handle, sql: """
            INSERT INTO posts (id, slug, title, title_html, excerpt, excerpt_html, content_html, link, guid, author_id, author_name, author_slug, author_url, published_at, modified_at, featured_media_url, featured_media_alt_text)
            VALUES
                (1, 'welcome', 'Welcome Post', '<h1>Welcome Post</h1>', 'Learn about Step Into Vision', '<p>Learn about Step Into Vision</p>', '<p>Accessible futures start here.</p>', 'https://stepinto.vision/welcome', 'guid-1', 1, 'A. Author', 'a-author', 'https://example.com/authors/a-author', '2024-01-10T12:00:00Z', '2024-01-10T12:00:00Z', NULL, NULL),
                (2, 'vision-update', 'Vision Update', '<h1>Vision Update</h1>', 'Product progress and roadmaps', '<p>Product progress and roadmaps</p>', '<p>Roadmaps and accessibility updates.</p>', 'https://stepinto.vision/vision-update', 'guid-2', 2, 'B. Builder', 'b-builder', 'https://example.com/authors/b-builder', '2024-02-15T09:30:00Z', '2024-02-15T09:30:00Z', 'https://cdn.example.com/image.jpg', 'Vision illustration'),
                (3, 'founders-letter', 'Founders Letter', '<h1>Founders Letter</h1>', '', '', '<p>Welcome to the future of inclusive design.</p>', 'https://stepinto.vision/founders-letter', 'guid-3', NULL, NULL, NULL, NULL, '2024-01-20T08:00:00Z', '2024-01-20T08:00:00Z', NULL, NULL);
        """)

        try exec(db: handle, sql: """
            INSERT INTO terms (id, slug, name, taxonomy, link, description) VALUES
                (1, 'company', 'Company', 'category', NULL, NULL),
                (2, 'product', 'Product', 'category', NULL, NULL),
                (3, 'guides', 'Guides', 'post_tag', NULL, NULL),
                (4, 'research', 'Research', 'post_tag', NULL, NULL);
        """)

        try exec(db: handle, sql: """
            INSERT INTO post_terms (post_id, term_id) VALUES
                (1, 1),
                (2, 2),
                (3, 1),
                (3, 3);
        """)
    }

    private func exec(db handle: OpaquePointer?, sql: String) throws {
        if sqlite3_exec(handle, sql, nil, nil, nil) != SQLITE_OK {
            throw SQLiteFixtureError.statementFailed
        }
    }
}

private enum SQLiteFixtureError: Error {
    case creationFailed
    case statementFailed
}
