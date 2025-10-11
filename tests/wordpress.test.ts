import { afterEach, describe, expect, it, vi } from "vitest"

import { fetchWordPressPosts, normalizeWordPressPost } from "../src/lib/wordpress"

afterEach(() => {
  vi.restoreAllMocks()
})

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

  it("falls back to numeric taxonomy IDs when embedded terms are absent", () => {
    const rawPost = {
      id: 200,
      slug: "no-embed",
      link: "https://stepinto.vision/no-embed",
      date: "2024-03-01T00:00:00",
      modified: "2024-03-02T00:00:00",
      title: { rendered: "No Embed" },
      excerpt: { rendered: "<p>Summary</p>" },
      content: { rendered: "<p>Body</p>" },
      categories: [1, 2],
      tags: [3],
    }

    const post = normalizeWordPressPost(rawPost as never)

    expect(post.categories).toEqual(["1", "2"])
    expect(post.tags).toEqual(["3"])
  })
})

describe("fetchWordPressPosts", () => {
  it("stops requesting pages when the total pages header is reached", async () => {
    const posts = [
      {
        id: 1,
        slug: "first",
        link: "https://stepinto.vision/first",
        date: "2024-01-01T00:00:00",
        modified: "2024-01-02T00:00:00",
        title: { rendered: "First" },
        excerpt: { rendered: "<p>First</p>" },
        content: { rendered: "<p>Body</p>" },
      },
    ]

    const response = new Response(JSON.stringify(posts), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-WP-TotalPages": "1",
      },
    })

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response)
    vi.stubGlobal("fetch", fetchMock)

    const result = await fetchWordPressPosts({ maxPages: 5 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(1)
    expect(result[0]?.slug).toBe("first")
  })

  it("requests embedded taxonomy data so categories and tags are populated", async () => {
    const posts = [
      {
        id: 2,
        slug: "second",
        link: "https://stepinto.vision/second",
        date: "2024-02-01T00:00:00",
        modified: "2024-02-02T00:00:00",
        title: { rendered: "Second" },
        excerpt: { rendered: "<p>Second</p>" },
        content: { rendered: "<p>Body</p>" },
      },
    ]

    const response = new Response(JSON.stringify(posts), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-WP-TotalPages": "1",
      },
    })

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response)
    vi.stubGlobal("fetch", fetchMock)

    await fetchWordPressPosts({ maxPages: 1 })

    const requestedUrl = fetchMock.mock.calls[0]?.[0]
    expect(requestedUrl).toBeInstanceOf(URL)
    const embedParam = (requestedUrl as URL).searchParams.get("_embed")
    expect(embedParam).toBe("true")
    expect((requestedUrl as URL).searchParams.has("_fields")).toBe(false)
  })
})
