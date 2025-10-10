import XCTest
@testable import StepIntoVisionMCPCore
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
        let writer = try ContentDatabase(path: databaseURL.path, mode: .readWrite, logger: Logger(isVerbose: true))
        try writer.initializeSchema()
        try writer.upsert(posts: TestFixtures.makePosts())
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
