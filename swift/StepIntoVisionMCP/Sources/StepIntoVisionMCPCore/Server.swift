import Foundation
import SQLite3
import MCP
import Logging

// MARK: - Logging

public struct Logger: Sendable {
    private let base: Logging.Logger

    public init(isVerbose: Bool) {
        var logger = Logging.Logger(label: "stepinto.swift.mcp")
        logger.logLevel = isVerbose ? .debug : .info
        self.base = logger
    }

    init(_ logger: Logging.Logger) {
        self.base = logger
    }

    var transportLogger: Logging.Logger { base }

    public func debug(_ message: @autoclosure () -> String) {
        base.debug("\(message())")
    }

    public func info(_ message: @autoclosure () -> String) {
        base.info("\(message())")
    }

    public func warn(_ message: @autoclosure () -> String) {
        base.warning("\(message())")
    }

    public func error(_ message: @autoclosure () -> String) {
        base.error("\(message())")
    }
}

// MARK: - Models

struct TermRecord: Hashable, Codable {
    let id: Int
    let slug: String
    let name: String
    let taxonomy: String
    let link: String?
    let description: String?

    func toJSON() -> [String: Any] {
        var payload: [String: Any] = [
            "id": id,
            "slug": slug,
            "name": name,
            "taxonomy": taxonomy
        ]
        if let link { payload["link"] = link }
        if let description { payload["description"] = description }
        return payload
    }
}

struct PostRecord: Codable {
    let id: Int
    let slug: String
    let title: String
    let titleHTML: String
    let excerpt: String
    let excerptHTML: String
    let contentHTML: String
    let link: String
    let guid: String
    let authorID: Int?
    let authorName: String?
    let authorSlug: String?
    let authorURL: String?
    let publishedAt: Date
    let modifiedAt: Date
    let featuredMediaURL: String?
    let featuredMediaAltText: String?
    let categories: [TermRecord]
    let tags: [TermRecord]

    func summary() -> PostSummary {
        let textExcerpt: String
        if excerpt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let fallback = htmlToText(contentHTML)
            textExcerpt = String(fallback.prefix(400))
        } else {
            textExcerpt = excerpt
        }
        return PostSummary(
            id: id,
            slug: slug,
            title: title,
            excerpt: textExcerpt,
            link: link,
            publishedAt: publishedAt,
            categories: categories,
            tags: tags,
            authorName: authorName
        )
    }

    func toJSON(includeHTML: Bool, includeText: Bool) -> [String: Any] {
        var payload = summary().toJSON()
        payload.updateValue(guid, forKey: "guid")
        payload.updateValue(iso8601String(from: modifiedAt), forKey: "modified_at")
        if let authorSlug { payload["author_slug"] = authorSlug }
        if let authorID { payload["author_id"] = authorID }
        if let authorURL { payload["author_url"] = authorURL }
        if let featuredMediaURL { payload["featured_media_url"] = featuredMediaURL }
        if let featuredMediaAltText { payload["featured_media_alt_text"] = featuredMediaAltText }
        if includeHTML {
            payload["content_html"] = contentHTML
        }
        if includeText {
            payload["content_text"] = normalizeWhitespace(htmlToText(contentHTML))
        }
        return payload
    }
}

struct PostSummary {
    let id: Int
    let slug: String
    let title: String
    let excerpt: String
    let link: String
    let publishedAt: Date
    let categories: [TermRecord]
    let tags: [TermRecord]
    let authorName: String?

    func toJSON() -> [String: Any] {
        var payload: [String: Any] = [
            "id": id,
            "slug": slug,
            "title": title,
            "excerpt": excerpt,
            "url": link,
            "published_at": iso8601String(from: publishedAt),
            "categories": categories.map { $0.toJSON() },
            "tags": tags.map { $0.toJSON() }
        ]
        if let authorName {
            payload["author"] = authorName
        }
        return payload
    }
}

// MARK: - Content Database

enum ContentDatabaseError: Error {
    case sqliteError(String)
    case notFound
}

public final class ContentDatabase {
    private let path: String
    private let logger: Logger

    public init(path: String, logger: Logger = Logger(isVerbose: false)) throws {
        self.path = path
        self.logger = logger
        try checkDatabaseExists()
    }

    private func checkDatabaseExists() throws {
        if !FileManager.default.fileExists(atPath: path) {
            throw ContentDatabaseError.sqliteError("Database not found at \(path)")
        }
    }

    private func connect() throws -> OpaquePointer? {
        var handle: OpaquePointer?
        let flags = SQLITE_OPEN_READONLY | SQLITE_OPEN_FULLMUTEX
        if sqlite3_open_v2(path, &handle, flags, nil) != SQLITE_OK {
            let message = handle.flatMap { sqlite3_errmsg($0) }.map { String(cString: $0) } ?? "Unknown error"
            throw ContentDatabaseError.sqliteError("Unable to open database: \(message)")
        }
        return handle
    }

    func listPosts(limit: Int, offset: Int, categorySlug: String?, tagSlug: String?) throws -> [PostRecord] {
        var clauses: [String] = []
        var params: [SQLiteBinding] = []
        if let categorySlug {
            clauses.append(
                """
                EXISTS (
                    SELECT 1 FROM post_terms pt
                    JOIN terms t ON t.id = pt.term_id
                    WHERE pt.post_id = posts.id
                      AND t.taxonomy = 'category'
                      AND t.slug = ?
                )
                """
            )
            params.append(.text(categorySlug))
        }
        if let tagSlug {
            clauses.append(
                """
                EXISTS (
                    SELECT 1 FROM post_terms pt
                    JOIN terms t ON t.id = pt.term_id
                    WHERE pt.post_id = posts.id
                      AND t.taxonomy = 'post_tag'
                      AND t.slug = ?
                )
                """
            )
            params.append(.text(tagSlug))
        }

        let whereClause = clauses.isEmpty ? "" : "WHERE " + clauses.joined(separator: " AND ")
        let sql = """
        SELECT posts.*
        FROM posts
        \(whereClause)
        ORDER BY posts.published_at DESC
        LIMIT ? OFFSET ?
        """
        params.append(.int(limit))
        params.append(.int(offset))
        return try fetchPosts(sql: sql, params: params)
    }

    func getPost(postID: Int?, slug: String?) throws -> PostRecord? {
        guard postID != nil || slug != nil else {
            throw ContentDatabaseError.sqliteError("Either post_id or slug must be provided")
        }
        let sql: String
        var params: [SQLiteBinding]
        if let postID {
            sql = "SELECT * FROM posts WHERE id = ?"
            params = [.int(postID)]
        } else if let slug {
            sql = "SELECT * FROM posts WHERE slug = ?"
            params = [.text(slug)]
        } else {
            return nil
        }
        return try fetchPosts(sql: sql, params: params).first
    }

    func searchPosts(query: String, limit: Int, offset: Int) throws -> [PostRecord] {
        let like = "%\(query)%"
        let sql = """
        SELECT DISTINCT posts.*
        FROM posts
        LEFT JOIN post_terms pt ON pt.post_id = posts.id
        LEFT JOIN terms t ON t.id = pt.term_id
        WHERE posts.title LIKE ?
           OR posts.excerpt LIKE ?
           OR posts.content_html LIKE ?
           OR t.name LIKE ?
        ORDER BY posts.published_at DESC
        LIMIT ? OFFSET ?
        """
        let params: [SQLiteBinding] = [.text(like), .text(like), .text(like), .text(like), .int(limit), .int(offset)]
        return try fetchPosts(sql: sql, params: params)
    }

    private func fetchPosts(sql: String, params: [SQLiteBinding]) throws -> [PostRecord] {
        guard let db = try connect() else { return [] }
        defer { sqlite3_close(db) }

        let rows = try executeQuery(db: db, sql: sql, params: params)
        let ids = rows.compactMap { $0.intValue(for: "id") }
        let termMap = try fetchTerms(db: db, postIDs: ids)
        return rows.compactMap { row in
            guard let id = row.intValue(for: "id"),
                  let slug = row.stringValue(for: "slug"),
                  let title = row.stringValue(for: "title"),
                  let titleHTML = row.stringValue(for: "title_html"),
                  let contentHTML = row.stringValue(for: "content_html"),
                  let link = row.stringValue(for: "link"),
                  let guid = row.stringValue(for: "guid"),
                  let published = row.dateValue(for: "published_at"),
                  let modified = row.dateValue(for: "modified_at")
            else {
                logger.warn("Skipping malformed row for post")
                return nil
            }

            let excerpt = row.stringValue(for: "excerpt") ?? ""
            let excerptHTML = row.stringValue(for: "excerpt_html") ?? ""

            let categories = termMap[id]?["category"] ?? []
            let tags = termMap[id]?["post_tag"] ?? []
            return PostRecord(
                id: id,
                slug: slug,
                title: title,
                titleHTML: titleHTML,
                excerpt: excerpt,
                excerptHTML: excerptHTML,
                contentHTML: contentHTML,
                link: link,
                guid: guid,
                authorID: row.optionalInt(for: "author_id"),
                authorName: row.stringValue(for: "author_name"),
                authorSlug: row.stringValue(for: "author_slug"),
                authorURL: row.stringValue(for: "author_url"),
                publishedAt: published,
                modifiedAt: modified,
                featuredMediaURL: row.stringValue(for: "featured_media_url"),
                featuredMediaAltText: row.stringValue(for: "featured_media_alt_text"),
                categories: categories,
                tags: tags
            )
        }
    }

    private func fetchTerms(db: OpaquePointer?, postIDs: [Int]) throws -> [Int: [String: [TermRecord]]] {
        guard !postIDs.isEmpty else { return [:] }
        let placeholders = Array(repeating: "?", count: postIDs.count).joined(separator: ",")
        let sql = """
        SELECT pt.post_id, t.id, t.slug, t.name, t.taxonomy, t.link, t.description
        FROM post_terms pt
        JOIN terms t ON t.id = pt.term_id
        WHERE pt.post_id IN (\(placeholders))
        """
        let params = postIDs.map(SQLiteBinding.int)
        let rows = try executeQuery(db: db, sql: sql, params: params)
        var mapping: [Int: [String: [TermRecord]]] = [:]
        for row in rows {
            guard let postID = row.intValue(for: "post_id"),
                  let termID = row.intValue(for: "id"),
                  let slug = row.stringValue(for: "slug"),
                  let name = row.stringValue(for: "name"),
                  let taxonomy = row.stringValue(for: "taxonomy")
            else { continue }
            let term = TermRecord(
                id: termID,
                slug: slug,
                name: name,
                taxonomy: taxonomy,
                link: row.stringValue(for: "link"),
                description: row.stringValue(for: "description")
            )
            var taxonomyTerms = mapping[postID] ?? [:]
            var existing = taxonomyTerms[taxonomy] ?? []
            existing.append(term)
            taxonomyTerms[taxonomy] = existing
            mapping[postID] = taxonomyTerms
        }
        return mapping
    }

    private func executeQuery(db: OpaquePointer?, sql: String, params: [SQLiteBinding]) throws -> [SQLiteRow] {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK else {
            let message = sqlite3_errmsg(db).map { String(cString: $0) } ?? "Unknown error"
            throw ContentDatabaseError.sqliteError("Failed to prepare query: \(message)")
        }
        defer { sqlite3_finalize(statement) }

        try bind(params, to: statement)

        var rows: [SQLiteRow] = []
        while true {
            let step = sqlite3_step(statement)
            if step == SQLITE_ROW {
                rows.append(SQLiteRow(statement: statement))
            } else if step == SQLITE_DONE {
                break
            } else {
                let message = sqlite3_errmsg(db).map { String(cString: $0) } ?? "Unknown error"
                throw ContentDatabaseError.sqliteError("SQLite step error: \(message)")
            }
        }
        return rows
    }
}

// MARK: - SQLite helpers

private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

enum SQLiteBinding {
    case int(Int)
    case text(String)
    case null
}

private func bind(_ params: [SQLiteBinding], to statement: OpaquePointer?) throws {
    for (index, param) in params.enumerated() {
        let position = Int32(index + 1)
        switch param {
        case .int(let value):
            sqlite3_bind_int64(statement, position, sqlite3_int64(value))
        case .text(let string):
            sqlite3_bind_text(statement, position, string, -1, SQLITE_TRANSIENT)
        case .null:
            sqlite3_bind_null(statement, position)
        }
    }
}

struct SQLiteRow {
    private let columnNames: [String]
    private let values: [SQLiteValue]

    init(statement: OpaquePointer?) {
        let columnCount = sqlite3_column_count(statement)
        var names: [String] = []
        var values: [SQLiteValue] = []
        names.reserveCapacity(Int(columnCount))
        values.reserveCapacity(Int(columnCount))
        for index in 0..<columnCount {
            let name = sqlite3_column_name(statement, index).map { String(cString: $0) } ?? "col_\(index)"
            names.append(name)
            let type = sqlite3_column_type(statement, index)
            switch type {
            case SQLITE_INTEGER:
                values.append(.integer(sqlite3_column_int64(statement, index)))
            case SQLITE_FLOAT:
                values.append(.double(sqlite3_column_double(statement, index)))
            case SQLITE_TEXT:
                if let textPointer = sqlite3_column_text(statement, index) {
                    values.append(.text(String(cString: textPointer)))
                } else {
                    values.append(.null)
                }
            case SQLITE_NULL:
                values.append(.null)
            default:
                if let textPointer = sqlite3_column_text(statement, index) {
                    values.append(.text(String(cString: textPointer)))
                } else {
                    values.append(.null)
                }
            }
        }
        self.columnNames = names
        self.values = values
    }

    func index(of column: String) -> Int? {
        columnNames.firstIndex(of: column)
    }

    func stringValue(for column: String) -> String? {
        guard let idx = index(of: column) else { return nil }
        return values[idx].stringValue
    }

    func intValue(for column: String) -> Int? {
        guard let idx = index(of: column) else { return nil }
        return values[idx].intValue
    }

    func optionalInt(for column: String) -> Int? {
        return intValue(for: column)
    }

    func dateValue(for column: String) -> Date? {
        guard let string = stringValue(for: column) else { return nil }
        if let precise = iso8601Date(from: string, includesFractional: true) {
            return precise
        }
        return iso8601Date(from: string, includesFractional: false)
    }
}

enum SQLiteValue {
    case integer(Int64)
    case double(Double)
    case text(String)
    case null

    var stringValue: String? {
        switch self {
        case .text(let string):
            return string
        case .integer(let value):
            return String(value)
        case .double(let value):
            return String(value)
        case .null:
            return nil
        }
    }

    var intValue: Int? {
        switch self {
        case .integer(let value):
            return Int(value)
        case .text(let string):
            return Int(string)
        case .double(let value):
            return Int(value)
        case .null:
            return nil
        }
    }
}

// MARK: - Utility helpers

private func iso8601Formatter(includesFractional: Bool) -> ISO8601DateFormatter {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = includesFractional
        ? [.withInternetDateTime, .withFractionalSeconds]
        : [.withInternetDateTime]
    return formatter
}

private func iso8601String(from date: Date) -> String {
    iso8601Formatter(includesFractional: true).string(from: date)
}

private func iso8601Date(from string: String, includesFractional: Bool) -> Date? {
    iso8601Formatter(includesFractional: includesFractional).date(from: string)
}

private func htmlToText(_ html: String) -> String {
#if canImport(UIKit) || canImport(AppKit)
    guard let data = html.data(using: .utf8) else { return html }
    if let attributed = try? NSAttributedString(
        data: data,
        options: [
            .documentType: NSAttributedString.DocumentType.html,
            .characterEncoding: String.Encoding.utf8.rawValue
        ],
        documentAttributes: nil
    ) {
        return attributed.string
    }
    return html
#else
    guard let regex = try? NSRegularExpression(pattern: "<[^>]+>", options: []) else {
        return html
    }
    let range = NSRange(location: 0, length: html.utf16.count)
    let stripped = regex.stringByReplacingMatches(in: html, options: [], range: range, withTemplate: " ")
    return normalizeWhitespace(stripped)
#endif
}

private func normalizeWhitespace(_ text: String) -> String {
    let components = text.split(whereSeparator: { $0.isWhitespace || $0.isNewline })
    return components.joined(separator: " ")
}

// MARK: - MCP Server

struct StepIntoVisionToolResponses {
    let database: ContentDatabase
    let logger: Logger

    func listPosts(arguments: ListPostsArguments) throws -> [String: Any] {
        let limit = arguments.limit ?? 10
        let offset = arguments.offset ?? 0
        if limit < 1 || limit > 50 {
            throw ToolArgumentError("limit must be between 1 and 50")
        }
        if offset < 0 {
            throw ToolArgumentError("offset cannot be negative")
        }
        let posts = try database
            .listPosts(limit: limit, offset: offset, categorySlug: arguments.categorySlug, tagSlug: arguments.tagSlug)
            .sorted { $0.publishedAt > $1.publishedAt }
        let items = posts.map { $0.summary().toJSON() }
        let filters: [String: Any] = [
            "category_slug": arguments.categorySlug ?? NSNull(),
            "tag_slug": arguments.tagSlug ?? NSNull()
        ]

        return [
            "count": items.count,
            "items": items,
            "paging": [
                "limit": limit,
                "offset": offset,
                "next_offset": offset + items.count
            ],
            "filters": filters
        ]
    }

    func getPost(arguments: GetPostArguments) throws -> [String: Any] {
        if arguments.slug == nil && arguments.postID == nil {
            throw ToolArgumentError("Either slug or post_id must be provided")
        }
        guard let post = try database.getPost(postID: arguments.postID, slug: arguments.slug) else {
            throw ContentDatabaseError.notFound
        }
        let includeHTML = arguments.includeHTML ?? false
        let includeText = arguments.includeText ?? true
        return post.toJSON(includeHTML: includeHTML, includeText: includeText)
    }

    func searchPosts(arguments: SearchPostsArguments) throws -> [String: Any] {
        guard let query = arguments.query, query.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2 else {
            throw ToolArgumentError("query must be at least 2 characters")
        }
        let limit = arguments.limit ?? 10
        if limit < 1 || limit > 20 {
            throw ToolArgumentError("limit must be between 1 and 20")
        }
        let offset = arguments.offset ?? 0
        if offset < 0 {
            throw ToolArgumentError("offset cannot be negative")
        }
        let posts = try database
            .searchPosts(query: query, limit: limit, offset: offset)
            .sorted { $0.publishedAt > $1.publishedAt }
        let items = posts.map { $0.toJSON(includeHTML: arguments.includeHTML ?? false, includeText: !(arguments.includeHTML ?? false)) }
        return [
            "query": query,
            "count": items.count,
            "items": items,
            "paging": [
                "limit": limit,
                "offset": offset,
                "next_offset": offset + items.count
            ]
        ]
    }
}

public final class StepIntoVisionMCPServer: @unchecked Sendable {
    private struct ToolRegistration {
        let definition: MCP.Tool
        let handler: @Sendable ([String: Value]?) async throws -> MCP.CallTool.Result
    }

    private static let serverName = "Step Into Vision Swift MCP"
    private static let serverVersion = "0.3.0"

    private let database: ContentDatabase
    private let logger: Logger
    private let instructions: String
    private let server: MCP.Server
    private let toolResponses: StepIntoVisionToolResponses
    private var tools: [String: ToolRegistration] = [:]

    public init(database: ContentDatabase, logger: Logger, instructions: String = StepIntoVisionMCPServer.defaultInstructions) async {
        self.database = database
        self.logger = logger
        self.instructions = instructions
        self.toolResponses = StepIntoVisionToolResponses(database: database, logger: logger)

        self.server = MCP.Server(
            name: Self.serverName,
            version: Self.serverVersion,
            instructions: instructions,
            capabilities: MCP.Server.Capabilities(
                logging: .init(),
                tools: .init(listChanged: true)
            ),
            configuration: .default
        )

        registerTools()
        await registerMethodHandlers()
    }

    public static let defaultInstructions = "Use these tools to browse and retrieve content from the Step Into Vision blog (https://stepinto.vision). Always include the post URL in your answer."

    public func run() async throws {
        logger.info("Starting Step Into Vision Swift MCP server (official Swift SDK)")

        let transport = StdioTransport(logger: logger.transportLogger)
        try await server.start(transport: transport)

        await server.waitUntilCompleted()
        logger.info("Server exiting")
    }

    private func registerMethodHandlers() async {
        await server.withMethodHandler(MCP.ListTools.self) { [weak self] _ in
            guard let self else { throw MCPError.internalError("Server deallocated") }
            let definitions = self.tools.values.map(\.definition).sorted { $0.name < $1.name }
            return MCP.ListTools.Result(tools: definitions)
        }

        await server.withMethodHandler(MCP.CallTool.self) { [weak self] parameters in
            guard let self else { throw MCPError.internalError("Server deallocated") }
            guard let registration = self.tools[parameters.name] else {
                throw MCPError.methodNotFound("Unknown tool: \(parameters.name)")
            }

            do {
                return try await registration.handler(parameters.arguments)
            } catch let error as ToolArgumentError {
                self.logger.warn("Rejected call to \(parameters.name) with validation error: \(error.message)")
                return MCP.CallTool.Result(content: [.text(error.message)], isError: true)
            } catch ContentDatabaseError.notFound {
                self.logger.warn("Requested resource not found for tool \(parameters.name)")
                return MCP.CallTool.Result(content: [.text("No matching content found.")], isError: true)
            } catch let error as MCPError {
                throw error
            } catch {
                self.logger.error("Unexpected error while handling \(parameters.name): \(error.localizedDescription)")
                return MCP.CallTool.Result(
                    content: [.text("Server error: \(error.localizedDescription)")],
                    isError: true
                )
            }
        }
    }

    private func registerTools() {
        registerTool(
            name: "list_posts",
            description: "List the most recent posts published on Step Into Vision.",
            inputSchema: listPostsSchema()
        ) { [self] arguments in
            let decoded: ListPostsArguments = try Self.decode(arguments, as: ListPostsArguments.self)
            let payload = try toolResponses.listPosts(arguments: decoded)
            return try Self.makeJSONResult(from: payload)
        }

        registerTool(
            name: "get_post",
            description: "Fetch a specific Step Into Vision post by slug or numeric ID.",
            inputSchema: getPostSchema()
        ) { [self] arguments in
            let decoded: GetPostArguments = try Self.decode(arguments, as: GetPostArguments.self)
            let payload = try toolResponses.getPost(arguments: decoded)
            return try Self.makeJSONResult(from: payload)
        }

        registerTool(
            name: "search_posts",
            description: "Search Step Into Vision posts by keyword.",
            inputSchema: searchPostsSchema()
        ) { [self] arguments in
            let decoded: SearchPostsArguments = try Self.decode(arguments, as: SearchPostsArguments.self)
            let payload = try toolResponses.searchPosts(arguments: decoded)
            return try Self.makeJSONResult(from: payload)
        }
    }

    private func registerTool(
        name: String,
        description: String,
        inputSchema: Value,
        annotations: MCP.Tool.Annotations = MCP.Tool.Annotations(
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false
        ),
        handler: @escaping @Sendable ([String: Value]?) async throws -> MCP.CallTool.Result
    ) {
        let definition = MCP.Tool(
            name: name,
            description: description,
            inputSchema: inputSchema,
            annotations: annotations
        )
        tools[name] = ToolRegistration(definition: definition, handler: handler)
    }

    private static func decode<T: Decodable>(_ arguments: [String: Value]?, as type: T.Type) throws -> T {
        let container = arguments ?? [:]
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(container)
        let decoder = JSONDecoder()
        return try decoder.decode(T.self, from: data)
    }

    private static func makeJSONResult(from payload: [String: Any]) throws -> MCP.CallTool.Result {
        let (data, text) = try encodePayload(payload)
        let dataURI = "data:application/json;base64,\(data.base64EncodedString())"
        let content: [MCP.Tool.Content] = [
            .text(text),
            .resource(uri: dataURI, mimeType: "application/json", text: text)
        ]
        return MCP.CallTool.Result(content: content)
    }

    private static func encodePayload(_ payload: [String: Any]) throws -> (Data, String) {
        guard JSONSerialization.isValidJSONObject(payload) else {
            throw MCPError.internalError("Tool payload could not be encoded as JSON")
        }
        let data = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
        guard let text = String(data: data, encoding: .utf8) else {
            throw MCPError.internalError("Tool payload was not valid UTF-8")
        }
        return (data, text)
    }

    private func listPostsSchema() -> Value {
        makeObjectSchema(
            properties: [
                "limit": integerSchema(minimum: 1, maximum: 50, defaultValue: 10, description: "Maximum number of posts to return."),
                "offset": integerSchema(minimum: 0, defaultValue: 0, description: "Number of posts to skip before starting the list."),
                "category_slug": stringSchema(description: "Filter results to a specific category slug."),
                "tag_slug": stringSchema(description: "Filter results to a specific tag slug.")
            ],
            additionalProperties: false
        )
    }

    private func getPostSchema() -> Value {
        makeObjectSchema(
            properties: [
                "slug": stringSchema(),
                "post_id": integerSchema(),
                "include_html": booleanSchema(defaultValue: false),
                "include_text": booleanSchema(defaultValue: true)
            ],
            additionalProperties: false
        )
    }

    private func searchPostsSchema() -> Value {
        makeObjectSchema(
            properties: [
                "query": stringSchema(minLength: 2, description: "Keywords to search for."),
                "limit": integerSchema(minimum: 1, maximum: 20, defaultValue: 10),
                "offset": integerSchema(minimum: 0, defaultValue: 0),
                "include_html": booleanSchema(defaultValue: false)
            ],
            required: ["query"],
            additionalProperties: false
        )
    }

    private func makeObjectSchema(
        properties: [String: Value],
        required: [String] = [],
        additionalProperties: Bool = false
    ) -> Value {
        var schema: [String: Value] = [
            "type": .string("object"),
            "properties": .object(properties),
            "additionalProperties": .bool(additionalProperties)
        ]
        if !required.isEmpty {
            schema["required"] = .array(required.map { .string($0) })
        }
        return .object(schema)
    }

    private func integerSchema(
        minimum: Int? = nil,
        maximum: Int? = nil,
        defaultValue: Int? = nil,
        description: String? = nil
    ) -> Value {
        var schema: [String: Value] = ["type": .string("integer")]
        if let minimum { schema["minimum"] = .int(minimum) }
        if let maximum { schema["maximum"] = .int(maximum) }
        if let defaultValue { schema["default"] = .int(defaultValue) }
        if let description { schema["description"] = .string(description) }
        return .object(schema)
    }

    private func stringSchema(
        minLength: Int? = nil,
        description: String? = nil
    ) -> Value {
        var schema: [String: Value] = ["type": .string("string")]
        if let minLength { schema["minLength"] = .int(minLength) }
        if let description { schema["description"] = .string(description) }
        return .object(schema)
    }

    private func booleanSchema(
        defaultValue: Bool? = nil,
        description: String? = nil
    ) -> Value {
        var schema: [String: Value] = ["type": .string("boolean")]
        if let defaultValue { schema["default"] = .bool(defaultValue) }
        if let description { schema["description"] = .string(description) }
        return .object(schema)
    }

    // Internal hooks for unit tests to verify tool registration without spinning up the transport.
    func toolDefinitionsForTesting() -> [MCP.Tool] {
        tools.values.map(\.definition).sorted { $0.name < $1.name }
    }

    func callToolForTesting(name: String, arguments: [String: Value]?) async throws -> MCP.CallTool.Result {
        guard let registration = tools[name] else {
            throw MCPError.methodNotFound("Unknown tool: \(name)")
        }
        return try await registration.handler(arguments)
    }
}

struct ToolArgumentError: Error {
    let message: String
    init(_ message: String) { self.message = message }
}

struct ListPostsArguments: Decodable {
    let limit: Int?
    let offset: Int?
    let categorySlug: String?
    let tagSlug: String?

    enum CodingKeys: String, CodingKey {
        case limit
        case offset
        case categorySlug = "category_slug"
        case tagSlug = "tag_slug"
    }
}

struct GetPostArguments: Decodable {
    let slug: String?
    let postID: Int?
    let includeHTML: Bool?
    let includeText: Bool?

    enum CodingKeys: String, CodingKey {
        case slug
        case postID = "post_id"
        case includeHTML = "include_html"
        case includeText = "include_text"
    }
}

struct SearchPostsArguments: Decodable {
    let query: String?
    let limit: Int?
    let offset: Int?
    let includeHTML: Bool?

    enum CodingKeys: String, CodingKey {
        case query
        case limit
        case offset
        case includeHTML = "include_html"
    }
}
