import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

import StepIntoVisionMCPCore

struct WordPressClient {
    private static let userAgent = "StepIntoVisionIngest/1.0 (+https://stepinto.vision)"

    struct PageResult {
        let posts: [PostRecord]
        let totalPages: Int
    }

    let baseURL: URL
    let session: URLSession
    let logger: Logger

    init(baseURL: URL, timeout: TimeInterval = 30.0, logger: Logger) {
        self.baseURL = baseURL
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = timeout
        configuration.httpAdditionalHeaders = ["User-Agent": Self.userAgent]
        self.session = URLSession(configuration: configuration)
        self.logger = logger
    }

    func fetchPosts(
        perPage: Int,
        page: Int,
        modifiedAfter: Date?
    ) async throws -> PageResult {
        var components = URLComponents(url: baseURL.appendingPathComponent("/wp-json/wp/v2/posts"), resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "per_page", value: String(perPage)),
            URLQueryItem(name: "page", value: String(page)),
            URLQueryItem(name: "status", value: "publish"),
            URLQueryItem(name: "orderby", value: "date"),
            URLQueryItem(name: "order", value: "desc"),
            URLQueryItem(name: "_embed", value: "true")
        ]
        if let modifiedAfter {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime]
            let value = formatter.string(from: modifiedAfter)
            components?.queryItems?.append(URLQueryItem(name: "modified_after", value: value))
        }
        guard let url = components?.url else {
            throw URLError(.badURL)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        guard (200..<300).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            logger.error("WordPress API error (status: \(http.statusCode)): \(body)")
            throw URLError(.badServerResponse)
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .iso8601
        let posts = try decoder.decode([WordPressPost].self, from: data)
        let records = posts.map { $0.toRecord() }
        let totalPagesHeader = http.value(forHTTPHeaderField: "X-WP-TotalPages")
        let totalPages = Int(totalPagesHeader ?? "") ?? page
        return PageResult(posts: records, totalPages: max(totalPages, page))
    }
}

// MARK: - WordPress decoding models

private struct WordPressPost: Decodable {
    struct RenderedText: Decodable {
        let rendered: String
    }

    struct EmbeddedAuthor: Decodable {
        let id: Int
        let name: String
        let slug: String
        let url: String?
    }

    struct EmbeddedMedia: Decodable {
        let sourceUrl: String?
        let altText: String?
    }

    struct EmbeddedTerm: Decodable {
        let id: Int
        let link: String?
        let name: String
        let slug: String
        let taxonomy: String
        let description: String?
    }

    struct EmbeddedData: Decodable {
        let author: [EmbeddedAuthor]?
        let wpTerm: [[EmbeddedTerm]]?
        let wpFeaturedmedia: [EmbeddedMedia]?
    }

    let id: Int
    let dateGmt: Date
    let modifiedGmt: Date
    let slug: String
    let link: String
    let title: RenderedText
    let content: RenderedText
    let excerpt: RenderedText
    let author: Int
    let guid: RenderedText
    let embedded: EmbeddedData?

    enum CodingKeys: String, CodingKey {
        case id
        case dateGmt = "date_gmt"
        case modifiedGmt = "modified_gmt"
        case slug
        case link
        case title
        case content
        case excerpt
        case author
        case guid
        case embedded = "_embedded"
    }

    func toRecord() -> PostRecord {
        let authorInfo = embedded?.author?.first

        var categories: [TermRecord] = []
        var tags: [TermRecord] = []
        if let termGroups = embedded?.wpTerm {
            for group in termGroups {
                guard let first = group.first else { continue }
                let records = group.map { $0.toTermRecord() }
                switch first.taxonomy {
                case "category": categories.append(contentsOf: records)
                case "post_tag": tags.append(contentsOf: records)
                default: tags.append(contentsOf: records)
                }
            }
        }

        var featuredURL: String?
        var featuredAltText: String?
        if let media = embedded?.wpFeaturedmedia?.first {
            featuredURL = media.sourceUrl
            featuredAltText = media.altText
        }

        return PostRecord(
            id: id,
            slug: slug,
            title: normalizeWhitespace(htmlToText(title.rendered)),
            titleHTML: title.rendered,
            excerpt: normalizeWhitespace(htmlToText(excerpt.rendered)),
            excerptHTML: excerpt.rendered,
            contentHTML: content.rendered,
            link: link,
            guid: guid.rendered,
            authorID: authorInfo?.id,
            authorName: authorInfo?.name,
            authorSlug: authorInfo?.slug,
            authorURL: authorInfo?.url,
            publishedAt: dateGmt,
            modifiedAt: modifiedGmt,
            featuredMediaURL: featuredURL,
            featuredMediaAltText: featuredAltText,
            categories: categories,
            tags: tags
        )
    }
}

private extension WordPressPost.EmbeddedTerm {
    func toTermRecord() -> TermRecord {
        TermRecord(
            id: id,
            slug: slug,
            name: name,
            taxonomy: taxonomy,
            link: link,
            description: description
        )
    }
}
