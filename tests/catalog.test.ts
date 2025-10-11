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
    seeAlso: [],
    contentDigest: "sha256-hello",
  },
  {
    id: 2,
    slug: "deep-dive",
    title: "Deep Dive",
    excerpt: "A deep dive",
    contentHtml: "<p>Dive</p>",
    contentMarkdown: "Dive",
    contentText: "Dive",
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
    seeAlso: [],
    contentDigest: "sha256-dive",
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
    expect(markdown).toContain("schema: mcp.post.v1")
    expect(markdown).toContain("title: Hello World")
    expect(markdown).toContain("mcpResource: stepintovision://post/hello-world")
    expect(markdown).toContain("aiReadableUrl: https://stepintovision.ai/hello-world")
    expect(markdown).toContain("## At a Glance")
    expect(markdown).toContain("- **Canonical URL:** https://stepinto.vision/hello-world")
    expect(markdown).toContain("## Body")
  })
})
