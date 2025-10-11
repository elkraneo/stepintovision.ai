import { describe, expect, it } from "vitest"

import { normalizeWordPressPost } from "../src/lib/wordpress"

describe("normalizeWordPressPost", () => {
  it("extracts categories, tags, and hero image", () => {
    const rawPost = {
      id: 100,
      slug: "example",
      link: "https://stepinto.vision/example",
      date: "2024-03-01T00:00:00",
      modified: "2024-03-02T00:00:00",
      title: { rendered: "Example &amp; Test" },
      excerpt: { rendered: "<p>Summary with <strong>HTML</strong></p>" },
      content: {
        rendered:
          "<p>Main content</p><script>console.log('ignored')</script><p>More content</p>",
      },
      _embedded: {
        "wp:term": [
          [
            { taxonomy: "category", name: "Insights" },
            { taxonomy: "category", name: "Spotlight" },
          ],
          [
            { taxonomy: "post_tag", name: "vision" },
            { taxonomy: "post_tag", name: "ai" },
          ],
        ],
        "wp:featuredmedia": [
          { source_url: "https://stepinto.vision/wp-content/uploads/example.jpg" },
        ],
      },
    }

    const post = normalizeWordPressPost(rawPost as never)

    expect(post.categories).toEqual(["Insights", "Spotlight"])
    expect(post.tags).toEqual(["vision", "ai"])
    expect(post.heroImage).toMatch(/example.jpg/)
    expect(post.title).toBe("Example & Test")
    expect(post.contentHtml).not.toContain("<script")
    expect(post.contentText).toContain("Main content")
  })
})
