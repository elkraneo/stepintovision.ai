import Foundation
@testable import StepIntoVisionMCPCore

enum TestFixtures {
    static func makePosts() -> [PostRecord] {
        let categoryCompany = TermRecord(id: 1, slug: "company", name: "Company", taxonomy: "category", link: nil, description: nil)
        let categoryProduct = TermRecord(id: 2, slug: "product", name: "Product", taxonomy: "category", link: nil, description: nil)
        let tagGuides = TermRecord(id: 3, slug: "guides", name: "Guides", taxonomy: "post_tag", link: nil, description: nil)

        return [
            PostRecord(
                id: 1,
                slug: "welcome",
                title: "Welcome Post",
                titleHTML: "<h1>Welcome Post</h1>",
                excerpt: "Learn about Step Into Vision",
                excerptHTML: "<p>Learn about Step Into Vision</p>",
                contentHTML: "<p>Accessible futures start here.</p>",
                link: "https://stepinto.vision/welcome",
                guid: "guid-1",
                authorID: 1,
                authorName: "A. Author",
                authorSlug: "a-author",
                authorURL: "https://example.com/authors/a-author",
                publishedAt: parseISO8601Date("2024-01-10T12:00:00Z")!,
                modifiedAt: parseISO8601Date("2024-01-10T12:00:00Z")!,
                featuredMediaURL: nil,
                featuredMediaAltText: nil,
                categories: [categoryCompany],
                tags: []
            ),
            PostRecord(
                id: 2,
                slug: "vision-update",
                title: "Vision Update",
                titleHTML: "<h1>Vision Update</h1>",
                excerpt: "Product progress and roadmaps",
                excerptHTML: "<p>Product progress and roadmaps</p>",
                contentHTML: "<p>Roadmaps and accessibility updates.</p>",
                link: "https://stepinto.vision/vision-update",
                guid: "guid-2",
                authorID: 2,
                authorName: "B. Builder",
                authorSlug: "b-builder",
                authorURL: "https://example.com/authors/b-builder",
                publishedAt: parseISO8601Date("2024-02-15T09:30:00Z")!,
                modifiedAt: parseISO8601Date("2024-02-15T09:30:00Z")!,
                featuredMediaURL: "https://cdn.example.com/image.jpg",
                featuredMediaAltText: "Vision illustration",
                categories: [categoryProduct],
                tags: []
            ),
            PostRecord(
                id: 3,
                slug: "founders-letter",
                title: "Founders Letter",
                titleHTML: "<h1>Founders Letter</h1>",
                excerpt: "",
                excerptHTML: "",
                contentHTML: "<p>Welcome to the future of inclusive design.</p>",
                link: "https://stepinto.vision/founders-letter",
                guid: "guid-3",
                authorID: nil,
                authorName: nil,
                authorSlug: nil,
                authorURL: nil,
                publishedAt: parseISO8601Date("2024-01-20T08:00:00Z")!,
                modifiedAt: parseISO8601Date("2024-01-20T08:00:00Z")!,
                featuredMediaURL: nil,
                featuredMediaAltText: nil,
                categories: [categoryCompany],
                tags: [tagGuides]
            )
        ]
    }
}
