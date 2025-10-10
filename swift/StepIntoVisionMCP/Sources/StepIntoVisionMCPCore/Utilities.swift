import Foundation

public func iso8601String(from date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: date)
}

public func parseISO8601Date(_ string: String) -> Date? {
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = fractional.date(from: string) {
        return date
    }
    let basic = ISO8601DateFormatter()
    basic.formatOptions = [.withInternetDateTime]
    return basic.date(from: string)
}

public func htmlToText(_ html: String) -> String {
    guard let regex = try? NSRegularExpression(pattern: "<[^>]+>", options: []) else {
        return html
    }
    let range = NSRange(location: 0, length: html.utf16.count)
    let stripped = regex.stringByReplacingMatches(in: html, options: [], range: range, withTemplate: " ")
    return normalizeWhitespace(stripped)
}

public func normalizeWhitespace(_ text: String) -> String {
    guard !text.isEmpty else { return "" }
    let components = text.split { $0.isWhitespace || $0.isNewline }
    return components.joined(separator: " ")
}
