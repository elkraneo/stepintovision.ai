import { describe, expect, it } from "vitest"

import {
  analyzeMarkdown,
  canonicalizeMarkdown,
  ensureCodeFenceLanguages,
} from "../src/lib/markdown-utils"

describe("canonicalizeMarkdown", () => {
  it("preserves code tokens while trimming prose", () => {
    const markdown = [
      "",
      "# Title",
      "",
      "Paragraph with trailing spaces   ",
      "",
      "```swift",
      "let value = 42  ",
      "```",
      "",
    ].join("\n")

    const canonical = canonicalizeMarkdown(markdown)

    expect(canonical.startsWith("# Title\n\nParagraph with trailing spaces\n")).toBe(true)
    expect(canonical.includes("let value = 42  \n")).toBe(true)
    expect(canonical.endsWith("\n")).toBe(true)
  })

  it("produces consistent code digests after canonicalization", () => {
    const markdown = "```swift\nlet number = 1\n```\n"
    const canonical = canonicalizeMarkdown(markdown)
    const code = analyzeMarkdown(canonical).code

    expect(code.blocks).toHaveLength(1)
    expect(code.blocks[0]?.digest).toMatch(/^sha256-/)
  })

  it("retags Swift fences detected after canonicalization", () => {
    const markdown = [
      "```text",
      "Model3D(named: \"Earth\", bundle: realityKitContentBundle)",
      "```",
      "",
    ].join("\n")

    const canonical = canonicalizeMarkdown(markdown)
    const retagged = ensureCodeFenceLanguages(canonical)
    const code = analyzeMarkdown(retagged).code

    expect(retagged.startsWith("```swift\n")).toBe(true)
    expect(code.blocks).toEqual([
      expect.objectContaining({
        lang: "swift",
      }),
    ])
  })
})
