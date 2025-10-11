import { describe, expect, it } from "vitest"

import { listPosts, searchPosts } from "../src/lib/catalog"
import { renderPostMarkdown } from "../src/lib/markdown"
import type { StepIntoVisionPost } from "../src/lib/types"

const samplePosts: StepIntoVisionPost[] = [
  {
    id: 1,
    slug: "hello-world",
    title: "Hello World",
    excerpt: "An introduction to Step Into Vision",
    contentHtml: "<p>Hello Vision</p>",
    contentMarkdown: "Hello Vision",
    contentText: "Hello Vision",
    wordCount: 2,
    tokenCount: 3,
    readingTimeSeconds: 30,
    link: "https://stepinto.vision/hello-world",
    publishedAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    categories: ["Announcements"],
    tags: ["welcome"],
    heroImage: null,
    locale: "en",
    author: "Step Into Vision",
    license: "All rights reserved",
    version: 1,
    normalized: true,
    verbatim: false,
    seeAlso: [],
    references: [],
    links: [],
    contentDigest: "sha256-hello",
    media: [],
  },
  {
    id: 2,
    slug: "deep-dive",
    title: "Deep Dive",
    excerpt: "A deep dive",
    contentHtml: "<p>Dive</p>",
    contentMarkdown: "Dive",
    contentText: "Dive",
    wordCount: 1,
    tokenCount: 1,
    readingTimeSeconds: 30,
    link: "https://stepinto.vision/deep-dive",
    publishedAt: "2024-02-01T00:00:00Z",
    updatedAt: "2024-02-02T00:00:00Z",
    categories: ["Research"],
    tags: ["analysis"],
    heroImage: null,
    locale: "en",
    author: "Step Into Vision",
    license: "All rights reserved",
    version: 1,
    normalized: true,
    verbatim: false,
    seeAlso: [],
    references: [],
    links: [],
    contentDigest: "sha256-dive",
    media: [],
  },
]

describe("catalog helpers", () => {
  it("sorts and filters posts", () => {
    const result = listPosts(samplePosts, { limit: 5, offset: 0 })
    expect(result[0].slug).toBe("deep-dive")
    expect(result[1].slug).toBe("hello-world")

    const filtered = listPosts(samplePosts, { category: "Announcements" })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].slug).toBe("hello-world")
  })

  it("searches posts with scoring", () => {
    const hits = searchPosts(samplePosts, "deep dive", 5)
    expect(hits).toHaveLength(1)
    expect(hits[0].slug).toBe("deep-dive")
    expect(hits[0].score).toBeGreaterThan(0)
  })

  it("renders markdown with metadata", () => {
    const markdown = renderPostMarkdown(samplePosts[0])
    expect(markdown.startsWith("# Hello World")).toBe(true)
    expect(markdown).toContain("Hello Vision")
    expect(markdown).not.toContain("schema: mcp.post.v1")
  })

  it("omits duplicated excerpts from the Markdown body", () => {
    const post: StepIntoVisionPost = {
      ...samplePosts[0],
      excerpt: "An introduction to Step Into Vision",
      contentMarkdown: "An introduction to Step Into Vision\n\nMore body content.",
    }

    const markdown = renderPostMarkdown(post)
    expect(markdown).not.toMatch(/An introduction to Step Into Vision\n\nAn introduction/)
    expect(markdown).toContain("More body content.")
  })
})
