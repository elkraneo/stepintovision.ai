import { describe, expect, it } from "vitest"

import { postsFromWordPressJson } from "../src/lib/wordpress-file"

const sample = await import("./fixtures/wordpress-sample.json", { assert: { type: "json" } })

describe("postsFromWordPressJson", () => {
  it("normalizes posts from a JSON array", () => {
    const posts = postsFromWordPressJson(sample.default)
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({
      slug: "sample-post",
      title: "Sample & Post",
      categories: ["News"],
      tags: ["sample"],
    })
  })

  it("throws when the export is not an array", () => {
    expect(() => postsFromWordPressJson({})).toThrowError(/JSON array/)
  })
})
