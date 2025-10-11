import { mkdir, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type { Hono } from "hono"

const dataPath = join(process.cwd(), "data/stepintovision.json")
let app: Hono | undefined

beforeAll(async () => {
  await mkdir(dirname(dataPath), { recursive: true })
  const payload = {
    metadata: {
      source: "https://stepinto.vision",
      generatedAt: new Date().toISOString(),
      itemCount: 1,
    },
    posts: [
      {
        id: 42,
        slug: "realitykit-basics-coordinate-space-conversion",
        title: "RealityKit Basics: Coordinate Space Conversion",
        excerpt: "Convert between world, view, and anchor spaces in RealityKit.",
        contentHtml: "<p>Example HTML</p>",
        contentMarkdown: "Example HTML",
        contentText: "Example HTML",
        wordCount: 2,
        tokenCount: 3,
        readingTimeSeconds: 30,
        link: "https://stepinto.vision/example-code/realitykit-basics-coordinate-space-conversion/",
        publishedAt: "2024-04-20T12:00:00Z",
        updatedAt: "2024-04-20T12:00:00Z",
        categories: ["Example Code"],
        tags: ["RealityKit"],
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
        contentDigest: "sha256-test",
        media: [],
      },
    ],
  }
  await writeFile(dataPath, JSON.stringify(payload, null, 2), "utf8")
  ;({ default: app } = await import("../src/index.ts"))
})

afterAll(async () => {
  await rm(dataPath, { force: true })
})

describe("ai-readable routing", () => {
  it("returns markdown when hitting the domain-mirrored path", async () => {
    const response = await app!.request(
      "/example-code/realitykit-basics-coordinate-space-conversion",
      {
        headers: {
          Accept: "text/markdown",
        },
      },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toContain("text/markdown")
    const body = await response.text()
    expect(body).toContain("RealityKit Basics: Coordinate Space Conversion")
    expect(body.startsWith("# RealityKit Basics: Coordinate Space Conversion")).toBe(true)
    expect(body).not.toContain("schema: mcp.post.v1")
  })

  it("supports the /mcp prefix for local workers", async () => {
    const response = await app!.request(
      "/mcp/example-code/realitykit-basics-coordinate-space-conversion",
    )

    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain("RealityKit Basics: Coordinate Space Conversion")
    expect(response.headers.get("Content-Location")).toBe(
      "https://stepinto.vision/example-code/realitykit-basics-coordinate-space-conversion/",
    )
  })
})
