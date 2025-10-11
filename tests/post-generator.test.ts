import { describe, expect, it } from "vitest"

import { generatePostArtifacts } from "../src/lib/post-generator"
import type { StepIntoVisionPostMetaDocument } from "../src/lib/types"

function createBaseMeta(
  overrides: Partial<StepIntoVisionPostMetaDocument> = {},
): StepIntoVisionPostMetaDocument {
  const base: StepIntoVisionPostMetaDocument = {
    schema: "mcp.post.v1",
    id: "1",
    slug: "sample-post",
    title: "Sample Post",
    description: "Sample description",
    summary: "Sample description",
    locale: "en",
    canonicalUrl: "https://stepinto.vision/sample-post/",
    markdownUri: "stepintovision://post/sample-post",
    mcpResource: "stepintovision://post/sample-post",
    publishedAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    categories: [],
    tags: [],
    author: { name: "Author" },
    license: { type: "AllRightsReserved" },
    contentType: "text/markdown",
    wordCount: 0,
    tokenCount: 0,
    readingTimeSeconds: 0,
    normalized: false,
    verbatim: true,
    code: { policy: "verbatim", blocks: [] },
    media: [],
    seeAlso: [],
    references: [],
    links: [],
    version: 1,
    contentDigest: "sha256-placeholder",
  }

  return { ...base, ...overrides }
}

describe("generatePostArtifacts", () => {
  it("retags Swift code fences while keeping code intact", () => {
    const markdown = [
      "# Example",
      "",
      "> RealityKit intro",
      "",
      "```text",
      "import SwiftUI",
      "struct Example: View {",
      "  var body: some View { Text(\"Hi\") }",
      "}",
      "```",
      "",
      "Final prose block.",
      "",
    ].join("\n")

    const result = generatePostArtifacts(markdown, createBaseMeta())

    expect(result.markdownOut).toContain("```swift")
    expect(result.jsonOut.code.policy).toBe("verbatim")
    expect(result.jsonOut.code.blocks[0].lang).toBe("swift")
    expect(result.jsonOut.code.blocks[0].digest.startsWith("sha256-")).toBe(true)
  })

  it("sets normalized flags to none when prose is untouched", () => {
    const markdown = "# Title\n\n> Quote\n"
    const result = generatePostArtifacts(markdown, createBaseMeta())
    expect(result.jsonOut.normalized).toBe(false)
    expect(result.jsonOut.normalizedScope).toBe("none")
  })

  it("deduplicates video links when videoUrl matches", () => {
    const markdown = "# Title\n\nBody text.\n"
    const json = createBaseMeta({
      videoUrl: "https://video.example.com/watch",
      links: [
        { role: "video", url: "https://video.example.com/watch", title: "Video" },
        { role: "docs", url: "https://developer.apple.com" },
      ],
    })

    const result = generatePostArtifacts(markdown, json)
    const videoLinks = result.jsonOut.links.filter((link) => link.role === "video")
    expect(videoLinks).toHaveLength(0)
    expect(result.jsonOut.videoUrl).toBe("https://video.example.com/watch")
  })

  it("computes reading time from prose word count", () => {
    const words = Array.from({ length: 250 }, (_, index) => `word${index + 1}`)
    const markdown = `# Heading\n\n${words.join(" ")}\n`
    const result = generatePostArtifacts(markdown, createBaseMeta())
    expect(result.jsonOut.wordCount).toBe(251) // heading adds one token
    expect(result.jsonOut.readingTimeSeconds).toBe(76)
  })

  it("preserves accurate code block positions after fence fixes", () => {
    const markdown = [
      "# Title",
      "",
      "Intro paragraph.",
      "",
      "```text",
      "Model3D(named: \"Earth\")",
      "```",
      "",
      "More text.",
      "",
    ].join("\n")

    const result = generatePostArtifacts(markdown, createBaseMeta())
    const block = result.jsonOut.code.blocks[0]
    expect(block.startLine).toBe(5)
    expect(block.endLine).toBe(7)
  })

  it("promotes high-signal keywords", () => {
    const markdown = [
      "# RealityKit Basics",
      "",
      "RealityViewContent provides guidance for GeometryProxy3D sizing.",
      "",
      "```text",
      "// comment",
      "```",
      "",
    ].join("\n")

    const json = createBaseMeta({
      categories: ["Example Code"],
      tags: ["RealityKit", "How to"],
      references: [
        {
          title: "GeometryProxy3D",
          url: "https://developer.apple.com/geometryproxy3d",
        },
      ],
    })

    const result = generatePostArtifacts(markdown, json)
    expect(result.jsonOut.keywords).toContain("realityviewcontent")
    expect(result.jsonOut.keywords).toContain("geometryproxy3d")
    expect(result.jsonOut.keywords).not.toContain("how")
  })
})
