import { createHash } from "node:crypto"

import { afterEach, describe, expect, it, vi } from "vitest"

import { fetchWordPressPosts, normalizeWordPressPost } from "../src/lib/wordpress"
import { renderPostMarkdown } from "../src/lib/markdown"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("normalizeWordPressPost", () => {
  it("normalizes metadata, hero image, and structured content", () => {
    const rawPost = {
      id: 100,
      slug: "example",
      link: "https://stepinto.vision/example",
      date: "2024-03-01T00:00:00",
      modified: "2024-03-02T00:00:00",
      title: { rendered: "Example &amp; Test" },
      excerpt: {
        rendered:
          "<p>Summary with <strong>HTML</strong> that provides several ways to values convert.</p><p>Model3D is a simple view that can load a USD or `.reality` file.</p>",
      },
      content: {
        rendered: `
          <p>Main content</p>
          <div class="wp-block-kevinbatdorf-code-block-pro" data-code-block-pro-font-family="Code-Pro">
            <span role="button" class="code-block-pro-copy-button"></span>
            <textarea class="code-block-pro-copy-button-textarea">struct Example: View {}</textarea>
            <pre class="shiki light-plus"><code class="language-swift"><span class="line">struct Example: View {}</span></code></pre>
          </div>
          <p>For background, see <a href="https://developer.apple.com/documentation/swiftui/edge3d/set">Edge3D.Set</a>.</p>
          <p>Follow the <a href="https://stepinto.vision/learn-visionos/#spatial">Spatial overview</a>.</p>
          <p>We’ll use this <a href="https://opengameart.org/content/a-bird-animation">blue bird</a> image from OpenGameArt, thanks to <strong><a href="https://opengameart.org/users/komiro100">komiro100</a></strong> (CC0).</p>
          <p>See also</p>
          <ul class="wp-block-list">
            <li><a href="https://stepinto.vision/example-1/">Example 1</a></li>
          </ul>
          <p><a href="https://github.com/stepintovision/realitykit-sample">GitHub Repo</a></p>
          <p><a href="https://github.com/stepintovision/realitykit-sample/archive/refs/heads/main.zip">Download ZIP</a></p>
          <figure class="wp-block-image"><img src="https://stepinto.vision/wp-content/uploads/example.jpg?resize=100" alt="" width="800" height="600" data-id="1" /><figcaption>Diagram alt</figcaption></figure>
          <figure class="wp-block-image"><img src="https://stepinto.vision/wp-content/uploads/example-2.jpg" alt="Secondary figure" width="640" height="480" /></figure>
          <div class="wp-block-embed is-type-video"><iframe src="https://player.vimeo.com/video/example"></iframe></div>
          <script>console.log('ignored')</script>
        `,
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
          {
            source_url: "https://stepinto.vision/wp-content/uploads/example.jpg?resize=1600",
            alt_text: "Hero diagram",
            media_details: { width: 1600, height: 900 },
          },
        ],
        author: [
          {
            name: "Joseph Simpson",
          },
        ],
      },
    }

    const post = normalizeWordPressPost(rawPost as never)

    expect(post.categories).toEqual(["Insights", "Spotlight"])
    expect(post.tags).toEqual(["vision", "ai"])
    expect(post.heroImage).toEqual({
      role: "hero",
      url: "https://stepinto.vision/wp-content/uploads/example.jpg",
      alt: "Hero diagram",
      width: 1600,
      height: 900,
    })
    expect(post.title).toBe("Example & Test")
    expect(post.contentHtml).not.toContain("<script")
    expect(post.contentMarkdown).toContain("```swift")
    expect(post.contentMarkdown).toContain("struct Example: View {}")
    expect(post.contentMarkdown).not.toContain("USD or")
    expect(post.contentText).toContain("Main content")
    expect(post.seeAlso).toEqual([
      { title: "Example 1", url: "https://stepinto.vision/example-1/" },
    ])
    expect(post.links).toEqual([
      {
        role: "series",
        url: "https://stepinto.vision/learn-visionos/#spatial",
        title: "Spatial overview",
        sourceType: "firstParty",
        rel: "canonical",
      },
      {
        role: "repo",
        url: "https://github.com/stepintovision/realitykit-sample",
        title: "GitHub Repo",
        sourceType: "thirdParty",
        rel: "supporting",
      },
      {
        role: "download",
        url: "https://github.com/stepintovision/realitykit-sample/archive/refs/heads/main.zip",
        title: "Download ZIP",
        sourceType: "thirdParty",
        rel: "supporting",
      },
    ])
    expect(post.status).toBeNull()
    expect(post.references).toEqual([
      {
        title: "Edge3D.Set",
        url: "https://developer.apple.com/documentation/swiftui/edge3d/set",
        role: "docs",
        sourceType: "thirdParty",
        rel: "supporting",
      },
    ])
    expect(post.locale).toBe("en")
    expect(post.author).toBe("Joseph Simpson")
    expect(post.license).toBe("AllRightsReserved")
    expect(post.contentDigest).toMatch(/^sha256-/)
    expect(post.excerpt).toContain("ways to convert values")
    expect(post.excerpt).toContain("USDZ or `.reality`")
    expect(post.wordCount).toBeGreaterThan(0)
    expect(post.tokenCount).toBeGreaterThan(0)
    expect(post.readingTimeSeconds).toBeGreaterThanOrEqual(30)
    expect(post.media).toEqual([
      {
        role: "hero",
        url: "https://stepinto.vision/wp-content/uploads/example.jpg",
        alt: "Hero diagram",
        width: 1600,
        height: 900,
      },
      {
        role: "illustration",
        url: "https://stepinto.vision/wp-content/uploads/example.jpg",
        alt: "Diagram alt",
        width: 800,
        height: 600,
      },
      {
        role: "illustration",
        url: "https://stepinto.vision/wp-content/uploads/example-2.jpg",
        alt: "Secondary figure",
        width: 640,
        height: 480,
      },
    ])
    expect(post.assetSourceUrl).toBe("https://opengameart.org/content/a-bird-animation")
    expect(post.assetAuthor).toBe("komiro100")
    expect(post.assetLicense).toBe("CC0")
    expect(post.videoUrl).toBe("https://player.vimeo.com/video/example")
    expect(post.normalized).toBe(true)
    expect(post.verbatim).toBe(false)
    expect(post.normalizedScope).toBe("prose")
    expect(post.contentMarkdown).not.toContain("xtension")
    expect(post.code.policy).toBe("verbatim")
    expect(post.code.blocks.length).toBeGreaterThan(0)
    expect(post.code.blocks[0]).toMatchObject({
      lang: "swift",
      digest: expect.stringMatching(/^sha256-/),
    })

    const rendered = renderPostMarkdown(post)
    const lines = rendered.split("\n")
    const firstBlock = post.code.blocks[0]
    expect(lines[firstBlock.startLine - 1]).toMatch(/^```swift/)
    expect(lines[firstBlock.endLine - 1]).toMatch(/^```/)

    const digest = createHash("sha256").update(rendered, "utf8").digest("hex")
    expect(post.contentDigest).toBe(`sha256-${digest}`)
  })

  it("labels glass background usage as Swift without mutating tokens", () => {
    const rawPost = {
      id: 300,
      slug: "glass-background",
      link: "https://stepinto.vision/glass-background",
      date: "2025-01-01T00:00:00",
      modified: "2025-01-02T00:00:00",
      title: { rendered: "Glass Background" },
      excerpt: { rendered: "<p>Summary</p>" },
      content: {
        rendered: `
          <p>This will let me do things like this.</p>
          <pre class="wp-block-code"><code>glassBackgroundBox(padding: 12, .top, .bottom)
glassBackgroundBox(padding: 12, .vertical)
glassBackgroundBox(padding: 12, .all)</code></pre>
        `,
      },
    }

    const post = normalizeWordPressPost(rawPost as never)

    expect(post.contentMarkdown).toContain("```swift")
    expect(post.contentMarkdown).toContain(
      "glassBackgroundBox(padding: 12, .top, .bottom)",
    )
    expect(post.contentMarkdown).toContain(
      "glassBackgroundBox(padding: 12, .vertical)",
    )
    expect(post.contentMarkdown).toContain("glassBackgroundBox(padding: 12, .all)")
    expect(post.code.policy).toBe("verbatim")
    expect(post.code.blocks).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^swift-[a-f0-9]{8}$/),
        lang: "swift",
        startLine: expect.any(Number),
        endLine: expect.any(Number),
        digest: expect.stringMatching(/^sha256-/),
      }),
    ])
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
    expect(post.heroImage).toBeNull()
    expect(post.author).toBe("Step Into Vision")
    expect(post.normalized).toBe(true)
    expect(post.verbatim).toBe(false)
    expect(post.code.policy).toBe("verbatim")
    expect(post.code.blocks).toHaveLength(0)
  })

  it("captures limitation status metadata and canonical discussion links", () => {
    const rawPost = {
      id: 400,
      slug: "pushwindow-volumes",
      link: "https://stepinto.vision/example?ref=source#",
      date: "2024-10-10T00:00:00Z",
      modified: "2024-10-10T00:00:00Z",
      title: { rendered: "Can we use pushWindow with volumes?" },
      excerpt: {
        rendered:
          "<p>As of October 10, 2024 and visionOS 2, we cannot use pushWindow with Volumes.</p>",
      },
      content: {
        rendered: `
          <p>As of October 10, 2024 and visionOS 2, we cannot use <code>pushWindow</code> with Volumes.</p>
          <p>See the <a href="https://forums.developer.apple.com/forums/thread/12345?login=true#654321">forum discussion</a>.</p>
          <p>Reference <a href="https://developer.apple.com/documentation/realitykit/model3d/">Model3D</a>.</p>
          <div class="wp-block-embed"><iframe src="https://www.youtube.com/embed/example#?secret=abc"></iframe></div>
        `,
      },
    }

    const post = normalizeWordPressPost(rawPost as never)

    expect(post.link).toBe("https://stepinto.vision/example")
    expect(post.videoUrl).toBe("https://www.youtube.com/embed/example")
    expect(post.status).toEqual(
      expect.objectContaining({
        type: "limitation",
        stability: "likely_to_change",
        note: expect.stringContaining("As of October 10, 2024"),
        appliesTo: expect.objectContaining({
          product: "visionOS",
          versions: ["2.x"],
        }),
        asOf: "2024-10-10T00:00:00.000Z",
      }),
    )

    expect(post.links.find((link) => link.role === "discussion")).toBeUndefined()

    expect(post.links.find((link) => link.role === "docs")).toBeUndefined()
    expect(post.references).toContainEqual(
      expect.objectContaining({
        url: "https://developer.apple.com/documentation/realitykit/model3d/",
        role: "docs",
      }),
    )
    expect(post.references).toContainEqual(
      expect.objectContaining({
        url: "https://forums.developer.apple.com/forums/thread/12345",
        role: "discussion",
        sourceType: "thirdParty",
        rel: "supporting",
      }),
    )
  })

  it("captures external article references with roles", () => {
    const rawPost = {
      id: 401,
      slug: "volume-window-zoom",
      link: "https://stepinto.vision/example-code/volume-window-zoom",
      date: "2024-10-10T00:00:00Z",
      modified: "2024-10-10T00:00:00Z",
      title: { rendered: "Volume Window Zoom" },
      excerpt: { rendered: "<p>Excerpt</p>" },
      content: {
        rendered: `
          <p>See Drew Olbrich's <a href="https://www.lunarskydiving.com/blog/volume-window-zoom/?login=true">Volume Window Zoom</a> write-up.</p>
        `,
      },
    }

    const post = normalizeWordPressPost(rawPost as never)

    expect(post.references).toContainEqual({
      title: "Volume Window Zoom",
      url: "https://www.lunarskydiving.com/blog/volume-window-zoom/",
      role: "article",
      sourceType: "thirdParty",
      rel: "supporting",
    })
    expect(post.links.find((link) => link.url.includes("lunarskydiving.com"))).toBeUndefined()
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
