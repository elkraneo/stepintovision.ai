import Foundation
import Logging
import MCP
import GRDB
import SQLiteData

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

public struct TermRecord: Hashable, Codable, Sendable {
    let id: Int
    let slug: String
    let name: String
    let taxonomy: String
    let link: String?
    let description: String?

    public init(
        id: Int,
        slug: String,
        name: String,
        taxonomy: String,
        link: String?,
        description: String?
    ) {
        self.id = id
        self.slug = slug
        self.name = name
        self.taxonomy = taxonomy
        self.link = link
        self.description = description
    }

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

public struct PostRecord: Codable, Sendable {
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
    let fetchedAt: Date?

    var allTerms: [TermRecord] { categories + tags }

    public init(
        id: Int,
        slug: String,
        title: String,
        titleHTML: String,
        excerpt: String,
        excerptHTML: String,
        contentHTML: String,
        link: String,
        guid: String,
        authorID: Int?,
        authorName: String?,
        authorSlug: String?,
        authorURL: String?,
        publishedAt: Date,
        modifiedAt: Date,
        featuredMediaURL: String?,
        featuredMediaAltText: String?,
        categories: [TermRecord],
        tags: [TermRecord],
        fetchedAt: Date? = nil
    ) {
        self.id = id
        self.slug = slug
        self.title = title
        self.titleHTML = titleHTML
        self.excerpt = excerpt
        self.excerptHTML = excerptHTML
        self.contentHTML = contentHTML
        self.link = link
        self.guid = guid
        self.authorID = authorID
        self.authorName = authorName
        self.authorSlug = authorSlug
        self.authorURL = authorURL
        self.publishedAt = publishedAt
        self.modifiedAt = modifiedAt
        self.featuredMediaURL = featuredMediaURL
        self.featuredMediaAltText = featuredMediaAltText
        self.categories = categories
        self.tags = tags
        self.fetchedAt = fetchedAt
    }

    func summary() -> PostSummary {
        let excerptText: String
        if excerpt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            excerptText = String(normalizeWhitespace(htmlToText(contentHTML)).prefix(400))
        } else {
            excerptText = excerpt
        }

        return PostSummary(
            id: id,
            slug: slug,
            title: title,
            excerpt: excerptText,
            link: link,
            publishedAt: publishedAt,
            modifiedAt: modifiedAt,
            fetchedAt: fetchedAt,
            categories: categories,
            tags: tags,
            authorName: authorName
        )
    }

    func toJSON(includeHTML: Bool, includeText: Bool) -> [String: Any] {
        var payload = summary().toJSON()
        payload["guid"] = guid
        payload["modified_at"] = iso8601String(from: modifiedAt)
        if let fetchedAt {
            payload["fetched_at"] = iso8601String(from: fetchedAt)
        }
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

public struct PostSummary: Sendable {
    let id: Int
    let slug: String
    let title: String
    let excerpt: String
    let link: String
    let publishedAt: Date
    let modifiedAt: Date
    let fetchedAt: Date?
    let categories: [TermRecord]
    let tags: [TermRecord]
    let authorName: String?

    public init(
        id: Int,
        slug: String,
        title: String,
        excerpt: String,
        link: String,
        publishedAt: Date,
        modifiedAt: Date,
        fetchedAt: Date?,
        categories: [TermRecord],
        tags: [TermRecord],
        authorName: String?
    ) {
        self.id = id
        self.slug = slug
        self.title = title
        self.excerpt = excerpt
        self.link = link
        self.publishedAt = publishedAt
        self.modifiedAt = modifiedAt
        self.fetchedAt = fetchedAt
        self.categories = categories
        self.tags = tags
        self.authorName = authorName
    }

    func toJSON() -> [String: Any] {
        var payload: [String: Any] = [
            "id": id,
            "slug": slug,
            "title": title,
            "excerpt": excerpt,
            "url": link,
            "published_at": iso8601String(from: publishedAt),
            "modified_at": iso8601String(from: modifiedAt),
            "categories": categories.map { $0.toJSON() },
            "tags": tags.map { $0.toJSON() }
        ]
        if let fetchedAt { payload["fetched_at"] = iso8601String(from: fetchedAt) }
        if let authorName { payload["author"] = authorName }
        return payload
    }

}

// MARK: - Content Database

public enum ContentDatabaseError: Error {
    case sqliteError(String)
    case notFound
}

public final class ContentDatabase: @unchecked Sendable {
    public enum Mode {
        case readOnly
        case readWrite
    }

    private let queue: DatabaseQueue
    private let logger: Logger
    private let mode: Mode

    public init(path: String, mode: Mode = .readOnly, logger: Logger) throws {
        self.logger = logger
        self.mode = mode
        var configuration = Configuration()
        configuration.readonly = mode == .readOnly
        configuration.prepareDatabase { db in
            try db.execute(sql: "PRAGMA foreign_keys = ON")
        }
        if mode == .readWrite {
            let directory = URL(fileURLWithPath: path).deletingLastPathComponent()
            if !directory.path.isEmpty {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            }
        }
        do {
            self.queue = try DatabaseQueue(path: path, configuration: configuration)
        } catch {
            throw ContentDatabaseError.sqliteError(error.localizedDescription)
        }
    }

    public func initializeSchema() throws {
        var migrator = DatabaseMigrator()
        if mode == .readWrite {
            do {
                try queue.inDatabase { db in
                    try db.execute(sql: "PRAGMA journal_mode=WAL")
                }
            } catch {
                throw ContentDatabaseError.sqliteError(error.localizedDescription)
            }
        }

        migrator.registerMigration("stepintovision.initial") { db in
            try db.execute(sql: """
                CREATE TABLE IF NOT EXISTS meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
            """)
            try db.execute(sql: """
                CREATE TABLE IF NOT EXISTS posts (
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
                    featured_media_alt_text TEXT,
                    fetched_at TEXT NOT NULL
                );
            """)
            try db.execute(sql: """
                CREATE TABLE IF NOT EXISTS terms (
                    id INTEGER PRIMARY KEY,
                    slug TEXT NOT NULL,
                    name TEXT NOT NULL,
                    taxonomy TEXT NOT NULL,
                    link TEXT,
                    description TEXT
                );
            """)
            try db.execute(sql: """
                CREATE TABLE IF NOT EXISTS post_terms (
                    post_id INTEGER NOT NULL,
                    term_id INTEGER NOT NULL,
                    PRIMARY KEY (post_id, term_id),
                    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
                    FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE CASCADE
                );
            """)
            try db.execute(sql: "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '1')")
        }
        try migrator.migrate(queue)
    }

    public func upsert(posts: [PostRecord]) throws {
        guard !posts.isEmpty else { return }
        let fetchedAt = iso8601String(from: Date())
        do {
            try queue.write { db in
                for post in posts {
                    try self.persist(post: post, fetchedAt: fetchedAt, db: db)
                }
            }
        } catch {
            throw ContentDatabaseError.sqliteError(error.localizedDescription)
        }
    }

    public func listPosts(
        limit: Int,
        offset: Int,
        categorySlug: String?,
        tagSlug: String?
    ) throws -> [PostRecord] {
        do {
            return try queue.read { db in
                let (sql, arguments) = Self.listPostsSQL(
                    limit: limit,
                    offset: offset,
                    categorySlug: categorySlug,
                    tagSlug: tagSlug
                )
                let rows = try Row.fetchAll(db, sql: sql, arguments: arguments)
                let termMap = try self.loadTerms(db: db, for: rows.map { $0["id"] as Int })
                return try rows.map { try self.makePost(from: $0, termBuckets: termMap[$0["id"] as Int] ?? TermBuckets()) }
            }
        } catch let error as ContentDatabaseError {
            throw error
        } catch {
            throw ContentDatabaseError.sqliteError(error.localizedDescription)
        }
    }

    public func getPost(postID: Int?, slug: String?) throws -> PostRecord? {
        do {
            return try queue.read { db in
                if let postID {
                    guard let row = try Row.fetchOne(db, sql: "SELECT * FROM posts WHERE id = ?", arguments: [postID]) else {
                        return nil
                    }
                    let termMap = try self.loadTerms(db: db, for: [postID])
                    return try self.makePost(from: row, termBuckets: termMap[postID] ?? TermBuckets())
                }

                if let slug {
                    guard let row = try Row.fetchOne(db, sql: "SELECT * FROM posts WHERE slug = ?", arguments: [slug]) else {
                        return nil
                    }
                    let postID = row["id"] as Int
                    let termMap = try self.loadTerms(db: db, for: [postID])
                    return try self.makePost(from: row, termBuckets: termMap[postID] ?? TermBuckets())
                }

                return nil
            }
        } catch let error as ContentDatabaseError {
            throw error
        } catch {
            throw ContentDatabaseError.sqliteError(error.localizedDescription)
        }
    }

    public func searchPosts(query: String, limit: Int, offset: Int) throws -> [PostRecord] {
        let like = "%\(query)%"
        do {
            return try queue.read { db in
                let rows = try Row.fetchAll(
                    db,
                    sql: """
                        SELECT DISTINCT posts.*
                        FROM posts
                        LEFT JOIN post_terms pt ON pt.post_id = posts.id
                        LEFT JOIN terms t ON t.id = pt.term_id
                        WHERE posts.title LIKE ?
                           OR posts.excerpt LIKE ?
                           OR posts.content_html LIKE ?
                           OR t.name LIKE ?
                        ORDER BY datetime(posts.published_at) DESC
                        LIMIT ? OFFSET ?
                    """,
                    arguments: [like, like, like, like, limit, offset]
                )
                let ids = rows.map { $0["id"] as Int }
                let termMap = try self.loadTerms(db: db, for: ids)
                return try rows.map { try self.makePost(from: $0, termBuckets: termMap[$0["id"] as Int] ?? TermBuckets()) }
            }
        } catch let error as ContentDatabaseError {
            throw error
        } catch {
            throw ContentDatabaseError.sqliteError(error.localizedDescription)
        }
    }

    private func persist(post: PostRecord, fetchedAt: String, db: Database) throws {
        try db.execute(
            sql: """
                INSERT INTO posts (
                    id, slug, title, title_html, excerpt, excerpt_html, content_html, link, guid,
                    author_id, author_name, author_slug, author_url,
                    published_at, modified_at, featured_media_url, featured_media_alt_text, fetched_at
                ) VALUES (
                    :id, :slug, :title, :title_html, :excerpt, :excerpt_html, :content_html, :link, :guid,
                    :author_id, :author_name, :author_slug, :author_url,
                    :published_at, :modified_at, :featured_media_url, :featured_media_alt_text, :fetched_at
                )
                ON CONFLICT(id) DO UPDATE SET
                    slug = excluded.slug,
                    title = excluded.title,
                    title_html = excluded.title_html,
                    excerpt = excluded.excerpt,
                    excerpt_html = excluded.excerpt_html,
                    content_html = excluded.content_html,
                    link = excluded.link,
                    guid = excluded.guid,
                    author_id = excluded.author_id,
                    author_name = excluded.author_name,
                    author_slug = excluded.author_slug,
                    author_url = excluded.author_url,
                    published_at = excluded.published_at,
                    modified_at = excluded.modified_at,
                    featured_media_url = excluded.featured_media_url,
                    featured_media_alt_text = excluded.featured_media_alt_text,
                    fetched_at = excluded.fetched_at
            """,
            arguments: [
                "id": post.id,
                "slug": post.slug,
                "title": post.title,
                "title_html": post.titleHTML,
                "excerpt": post.excerpt,
                "excerpt_html": post.excerptHTML,
                "content_html": post.contentHTML,
                "link": post.link,
                "guid": post.guid,
                "author_id": post.authorID,
                "author_name": post.authorName,
                "author_slug": post.authorSlug,
                "author_url": post.authorURL,
                "published_at": iso8601String(from: post.publishedAt),
                "modified_at": iso8601String(from: post.modifiedAt),
                "featured_media_url": post.featuredMediaURL,
                "featured_media_alt_text": post.featuredMediaAltText,
                "fetched_at": fetchedAt
            ]
        )

        try db.execute(sql: "DELETE FROM post_terms WHERE post_id = ?", arguments: [post.id])
        for term in post.allTerms {
            try upsert(term: term, db: db)
            try db.execute(
                sql: "INSERT OR IGNORE INTO post_terms (post_id, term_id) VALUES (?, ?)",
                arguments: [post.id, term.id]
            )
        }
    }

    private func upsert(term: TermRecord, db: Database) throws {
        try db.execute(
            sql: """
                INSERT INTO terms (id, slug, name, taxonomy, link, description)
                VALUES (:id, :slug, :name, :taxonomy, :link, :description)
                ON CONFLICT(id) DO UPDATE SET
                    slug = excluded.slug,
                    name = excluded.name,
                    taxonomy = excluded.taxonomy,
                    link = excluded.link,
                    description = excluded.description
            """,
            arguments: [
                "id": term.id,
                "slug": term.slug,
                "name": term.name,
                "taxonomy": term.taxonomy,
                "link": term.link,
                "description": term.description
            ]
        )
    }

    private func loadTerms(db: Database, for ids: [Int]) throws -> [Int: TermBuckets] {
        guard !ids.isEmpty else { return [:] }
        let placeholders = ids.map { _ in "?" }.joined(separator: ",")
        let positional: [(any DatabaseValueConvertible)?] = ids.map { $0 }
        let rows = try Row.fetchAll(
            db,
            sql: """
                SELECT pt.post_id, t.id, t.slug, t.name, t.taxonomy, t.link, t.description
                FROM post_terms pt
                JOIN terms t ON t.id = pt.term_id
                WHERE pt.post_id IN (\(placeholders))
            """,
            arguments: StatementArguments(positional)
        )
        var buckets: [Int: TermBuckets] = [:]
        for row in rows {
            let postID: Int = row["post_id"]
            var current = buckets[postID] ?? TermBuckets()
            let term = TermRecord(
                id: row["id"],
                slug: row["slug"],
                name: row["name"],
                taxonomy: row["taxonomy"],
                link: row["link"],
                description: row["description"]
            )
            switch term.taxonomy {
            case "category": current.categories.append(term)
            case "post_tag": current.tags.append(term)
            default: current.tags.append(term)
            }
            buckets[postID] = current
        }
        return buckets
    }

    private func makePost(from row: Row, termBuckets: TermBuckets) throws -> PostRecord {
        guard let publishedString: String = row["published_at"],
              let modifiedString: String = row["modified_at"],
              let publishedDate = parseISO8601Date(publishedString),
              let modifiedDate = parseISO8601Date(modifiedString) else {
            throw ContentDatabaseError.sqliteError("Invalid date encoding in database")
        }

        let fetchedDate: Date?
        if let fetchedString: String = row["fetched_at"],
           let parsed = parseISO8601Date(fetchedString) {
            fetchedDate = parsed
        } else {
            fetchedDate = nil
        }

        return PostRecord(
            id: row["id"],
            slug: row["slug"],
            title: row["title"],
            titleHTML: row["title_html"],
            excerpt: row["excerpt"] ?? "",
            excerptHTML: row["excerpt_html"] ?? "",
            contentHTML: row["content_html"],
            link: row["link"],
            guid: row["guid"],
            authorID: row["author_id"],
            authorName: row["author_name"],
            authorSlug: row["author_slug"],
            authorURL: row["author_url"],
            publishedAt: publishedDate,
            modifiedAt: modifiedDate,
            featuredMediaURL: row["featured_media_url"],
            featuredMediaAltText: row["featured_media_alt_text"],
            categories: termBuckets.categories,
            tags: termBuckets.tags,
            fetchedAt: fetchedDate
        )
    }

    private static func listPostsSQL(
        limit: Int,
        offset: Int,
        categorySlug: String?,
        tagSlug: String?
    ) -> (String, StatementArguments) {
        var sql = "SELECT posts.* FROM posts"
        var clauses: [String] = []
        var argumentStorage: [String: (any DatabaseValueConvertible)?] = [:]
        if let categorySlug {
            clauses.append("""
                EXISTS (
                    SELECT 1 FROM post_terms pt
                    JOIN terms t ON t.id = pt.term_id
                    WHERE pt.post_id = posts.id
                      AND t.taxonomy = 'category'
                      AND t.slug = :category_slug
                )
            """)
            argumentStorage["category_slug"] = categorySlug
        }
        if let tagSlug {
            clauses.append("""
                EXISTS (
                    SELECT 1 FROM post_terms pt
                    JOIN terms t ON t.id = pt.term_id
                    WHERE pt.post_id = posts.id
                      AND t.taxonomy = 'post_tag'
                      AND t.slug = :tag_slug
                )
            """)
            argumentStorage["tag_slug"] = tagSlug
        }
        if !clauses.isEmpty {
            sql += " WHERE " + clauses.joined(separator: " AND ")
        }
        sql += " ORDER BY datetime(posts.published_at) DESC LIMIT :limit OFFSET :offset"
        argumentStorage["limit"] = limit
        argumentStorage["offset"] = offset
        return (sql, StatementArguments(argumentStorage))
    }
}

private struct TermBuckets {
    var categories: [TermRecord] = []
    var tags: [TermRecord] = []
}

// MARK: - Utility helpers

// MARK: - MCP Server

struct ToolDisplayPayload {
    let payload: [String: Any]
    let displayText: String
}

struct StepIntoVisionToolResponses {
    let database: ContentDatabase
    let logger: Logger

    func listPosts(arguments: ListPostsArguments) throws -> ToolDisplayPayload {
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
        let summaries = posts.map { $0.summary() }
        let items = summaries.map { $0.toJSON() }
        let filters: [String: Any] = [
            "category_slug": arguments.categorySlug ?? NSNull(),
            "tag_slug": arguments.tagSlug ?? NSNull()
        ]

        let payload: [String: Any] = [
            "count": items.count,
            "items": items,
            "paging": [
                "limit": limit,
                "offset": offset,
                "next_offset": offset + items.count
            ],
            "filters": filters
        ]

        let displayText = formatListPostsDisplay(
            summaries: summaries,
            limit: limit,
            offset: offset,
            categorySlug: arguments.categorySlug,
            tagSlug: arguments.tagSlug
        )

        return ToolDisplayPayload(payload: payload, displayText: displayText)
    }

    private func formatListPostsDisplay(
        summaries: [PostSummary],
        limit: Int,
        offset: Int,
        categorySlug: String?,
        tagSlug: String?
    ) -> String {
        var lines: [String] = []
        var header = "Showing \(summaries.count) post(s)"
        var filters: [String] = []
        if let categorySlug { filters.append("category \"\(categorySlug)\"") }
        if let tagSlug { filters.append("tag \"\(tagSlug)\"") }
        if !filters.isEmpty {
            header += " filtered by " + filters.joined(separator: " and ")
        }
        header += " (limit \(limit), offset \(offset))."
        lines.append(header)

        if summaries.isEmpty {
            lines.append("No posts matched the request.")
            return lines.joined(separator: "\n")
        }

        lines.append("")
        lines.append(contentsOf: formattedSummaries(summaries))
        return lines.joined(separator: "\n")
    }

    func getPost(arguments: GetPostArguments) throws -> ToolDisplayPayload {
        if arguments.slug == nil && arguments.postID == nil {
            throw ToolArgumentError("Either slug or post_id must be provided")
        }
        guard let post = try database.getPost(postID: arguments.postID, slug: arguments.slug) else {
            throw ContentDatabaseError.notFound
        }
        let includeHTML = arguments.includeHTML ?? false
        let includeText = arguments.includeText ?? true
        let payload = post.toJSON(includeHTML: includeHTML, includeText: includeText)
        let displayText = formatPostDetail(
            summary: post.summary(),
            includeHTML: includeHTML,
            includeText: includeText
        )
        return ToolDisplayPayload(payload: payload, displayText: displayText)
    }

    private func formatPostDetail(
        summary: PostSummary,
        includeHTML: Bool,
        includeText: Bool
    ) -> String {
        var lines: [String] = []
        lines.append("Post: \(summary.title)")
        lines.append("URL: \(summary.link)")

        var meta: [String] = ["Published: \(displayDateString(for: summary.publishedAt))"]
        if summary.modifiedAt != summary.publishedAt {
            meta.append("Updated: \(displayDateString(for: summary.modifiedAt))")
        }
        if let fetched = summary.fetchedAt {
            meta.append("Fetched: \(displayTimestampString(for: fetched))")
        }
        if let author = summary.authorName, !author.isEmpty {
            meta.append("Author: \(author)")
        }
        lines.append(meta.joined(separator: " • "))

        if !summary.categories.isEmpty {
            lines.append("Categories: \(formatTerms(summary.categories))")
        }
        if !summary.tags.isEmpty {
            lines.append("Tags: \(formatTerms(summary.tags))")
        }

        if let snippet = excerptSnippet(from: summary) {
            lines.append("")
            lines.append(snippet)
        }

        if let inclusion = describeContentInclusions(includeHTML: includeHTML, includeText: includeText) {
            lines.append("")
            lines.append(inclusion)
        }

        return lines.joined(separator: "\n")
    }

    func searchPosts(arguments: SearchPostsArguments) throws -> ToolDisplayPayload {
        guard let query = arguments.query?.trimmingCharacters(in: .whitespacesAndNewlines), query.count >= 2 else {
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
        let posts = try database.searchPosts(query: query, limit: limit, offset: offset)
        let summaries = posts.map { $0.summary() }
        let includeHTML = arguments.includeHTML ?? false
        let includeText = includeHTML ? false : true
        let items = posts.map { $0.toJSON(includeHTML: includeHTML, includeText: includeText) }
        let payload: [String: Any] = [
            "query": query,
            "count": items.count,
            "items": items,
            "paging": [
                "limit": limit,
                "offset": offset,
                "next_offset": offset + items.count
            ]
        ]

        let displayText = formatSearchPostsDisplay(
            query: query,
            summaries: summaries,
            limit: limit,
            offset: offset,
            includeHTML: includeHTML,
            includeText: includeText
        )

        return ToolDisplayPayload(payload: payload, displayText: displayText)
    }

    private func formatSearchPostsDisplay(
        query: String,
        summaries: [PostSummary],
        limit: Int,
        offset: Int,
        includeHTML: Bool,
        includeText: Bool
    ) -> String {
        var lines: [String] = []
        lines.append("Search results for \"\(query)\": \(summaries.count) post(s) (limit \(limit), offset \(offset)).")
        if let inclusion = describeContentInclusions(includeHTML: includeHTML, includeText: includeText) {
            lines.append(inclusion)
        }

        if summaries.isEmpty {
            lines.append("No posts matched the query.")
            return lines.joined(separator: "\n")
        }

        lines.append("")
        lines.append(contentsOf: formattedSummaries(summaries))
        return lines.joined(separator: "\n")
    }

    private func formattedSummaries(_ summaries: [PostSummary]) -> [String] {
        var lines: [String] = []
        for (index, summary) in summaries.enumerated() {
            lines.append("\(index + 1). \(summary.title)")

            var metadata: [String] = ["Published: \(displayDateString(for: summary.publishedAt))"]
            if summary.modifiedAt != summary.publishedAt {
                metadata.append("Updated: \(displayDateString(for: summary.modifiedAt))")
            }
            if let fetched = summary.fetchedAt {
                metadata.append("Fetched: \(displayTimestampString(for: fetched))")
            }
            if let author = summary.authorName, !author.isEmpty {
                metadata.append("Author: \(author)")
            }
            if !summary.categories.isEmpty {
                metadata.append("Categories: \(formatTerms(summary.categories))")
            }
            if !summary.tags.isEmpty {
                metadata.append("Tags: \(formatTerms(summary.tags))")
            }
            if !metadata.isEmpty {
                lines.append("   " + metadata.joined(separator: " • "))
            }

            if let snippet = excerptSnippet(from: summary) {
                lines.append("   \(snippet)")
            }

            lines.append("   \(summary.link)")

            if index < summaries.count - 1 {
                lines.append("")
            }
        }
        return lines
    }

    private func describeContentInclusions(includeHTML: Bool, includeText: Bool) -> String? {
        var parts: [String] = []
        if includeHTML {
            parts.append("HTML markup")
        }
        if includeText {
            parts.append("plain-text content")
        }
        guard !parts.isEmpty else { return nil }
        let joined = parts.joined(separator: " and ")
        return "JSON response includes \(joined)."
    }

    private func excerptSnippet(from summary: PostSummary) -> String? {
        let raw = normalizeWhitespace(htmlToText(summary.excerpt))
        guard !raw.isEmpty else { return nil }
        return truncated(raw, maxLength: 240)
    }

    private func formatTerms(_ terms: [TermRecord]) -> String {
        terms.map(\.name).joined(separator: ", ")
    }

    private func displayDateString(for date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        return formatter.string(from: date)
    }

    private func displayTimestampString(for date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    private func truncated(_ text: String, maxLength: Int) -> String {
        guard text.count > maxLength else { return text }
        let index = text.index(text.startIndex, offsetBy: maxLength)
        var truncated = String(text[..<index])
        if let lastSpace = truncated.lastIndex(of: " ") {
            truncated = String(truncated[..<lastSpace])
        }
        return truncated + "…"
    }
}

public final class StepIntoVisionMCPServer: @unchecked Sendable {
    private struct ToolRegistration {
        let definition: MCP.Tool
        let handler: @Sendable ([String: Value]?) async throws -> MCP.CallTool.Result
    }

    private static let serverName = "Step Into Vision Swift MCP"
    private static let serverVersion = "0.4.0"

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

    private static func makeJSONResult(from payload: ToolDisplayPayload) throws -> MCP.CallTool.Result {
        let (data, text) = try encodePayload(payload.payload)
        let dataURI = "data:application/json;base64,\(data.base64EncodedString())"
        let content: [MCP.Tool.Content] = [
            .text(payload.displayText),
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

    // MARK: - Internal hooks for unit testing

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
