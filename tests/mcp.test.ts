import { describe, expect, it } from "vitest"

import {
  buildMetaDocument,
  buildMetaResourceItem,
  buildResourceItem,
  createMcpServer,
} from "../src/lib/mcp"
import { normalizeWordPressPost } from "../src/lib/wordpress"

function createSampleWordPressPost() {
  return {
    id: 101,
    slug: "spatial-swiftui-model3d",
    link: "https://stepinto.vision/example-code/spatial-swiftui-model3d/",
    date: "2025-02-25T13:46:46",
    modified: "2025-02-25T13:46:46",
    title: { rendered: "Spatial SwiftUI: Model3D" },
    excerpt: {
      rendered:
        "<p>Model3D is a simple view that can load a USD or `.reality` file.</p>",
    },
    content: {
      rendered: `
        <p>Model3D is a simple view that can load a USD or <code>.reality</code> file.</p>
        <pre><code class="language-swift">Model3D(named: "Earth")</code></pre>
      `,
    },
    _embedded: {
      "wp:term": [
        [
          { taxonomy: "category", name: "Example Code" },
          { taxonomy: "category", name: "Spatial" },
        ],
        [
          { taxonomy: "post_tag", name: "RealityKit" },
        ],
      ],
      "wp:featuredmedia": [
        {
          source_url: "https://stepinto.vision/wp-content/uploads/model3d.jpg",
          alt_text: "Model3D hero",
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
}

describe("MCP resource metadata", () => {
  it("includes code metadata and canonical fields on markdown resources", () => {
    const post = normalizeWordPressPost(createSampleWordPressPost() as never)
    const resource = buildResourceItem(post)

    const isoUpdatedAt = new Date(post.updatedAt).toISOString()

    expect(resource.annotations?.lastModified).toBe(isoUpdatedAt)
    const meta = resource._meta as Record<string, unknown>

    expect(meta).toBeDefined()
    expect(meta).toMatchObject({
      canonicalUrl: post.link,
      author: { name: post.author },
      mcpResource: `stepintovision://post/${post.slug}`,
      metaUri: `stepintovision://post/${post.slug}/meta`,
      code: {
        policy: "verbatim",
      },
      normalizedScope: "prose",
    })
    expect(Array.isArray(meta.keywords)).toBe(true)
    expect(meta.keywords).toEqual(
      expect.arrayContaining(["realitykit", "spatial", "model3d", "swiftui"]),
    )
    const codeMeta = (meta.code ?? {}) as { blocks?: unknown[] }
    expect(Array.isArray(codeMeta.blocks)).toBe(true)
    expect(codeMeta.blocks?.length ?? 0).toBeGreaterThan(0)
  })

  it("propagates freshness metadata on JSON companions", () => {
    const post = normalizeWordPressPost(createSampleWordPressPost() as never)
    const metaResource = buildMetaResourceItem(post)

    const isoUpdatedAt = new Date(post.updatedAt).toISOString()

    expect(metaResource.annotations?.lastModified).toBe(isoUpdatedAt)
    expect(metaResource._meta).toMatchObject({
      canonicalUrl: post.link,
      markdownUri: `stepintovision://post/${post.slug}`,
      mcpResource: `stepintovision://post/${post.slug}`,
    })
  })

  it("recomputes code metadata when missing on legacy catalog entries", () => {
    const post = normalizeWordPressPost(createSampleWordPressPost() as never)
    post.code = { policy: "verbatim", blocks: [] }
    post.contentDigest = ""

    const resource = buildResourceItem(post)
    const metaDocument = buildMetaDocument(post)

    const resourceMeta = resource._meta as { code?: { blocks?: unknown[] } }
    expect(resourceMeta.code?.blocks?.length).toBeGreaterThan(0)
    expect(metaDocument.code.blocks.length).toBeGreaterThan(0)
    expect(metaDocument.contentDigest).toMatch(/^sha256-/)
    expect(metaDocument.normalizedScope).toBe("prose")
    expect(metaDocument.keywords).toEqual(
      expect.arrayContaining(["realitykit", "spatial", "model3d", "swiftui"]),
    )
    expect(metaDocument.mcpResource).toBe(`stepintovision://post/${post.slug}`)
  })

  it("throws when stored digests do not match canonical output", () => {
    const post = normalizeWordPressPost(createSampleWordPressPost() as never)
    post.contentDigest = "sha256-deadbeef"

    expect(() => buildResourceItem(post)).toThrow(/Content digest mismatch/)
    expect(() => buildMetaDocument(post)).toThrow(/Content digest mismatch/)
  })

  it("surfaces code metadata on list resources without fetching JSON sidecars", async () => {
    const first = normalizeWordPressPost(createSampleWordPressPost() as never)
    const secondRaw = createSampleWordPressPost()
    secondRaw.id = 202
    secondRaw.slug = "spatial-swiftui-model3d-phase"
    secondRaw.link = "https://stepinto.vision/example-code/spatial-swiftui-model3d-phase/"
    secondRaw.date = "2025-02-24T10:00:00"
    secondRaw.modified = "2025-02-24T11:00:00"
    secondRaw.content.rendered = `
      <p>Another example using Model3D.</p>
      <pre><code class="language-swift">Model3D(named: "Moon")</code></pre>
    `
    const second = normalizeWordPressPost(secondRaw as never)

    const posts = [first, second]
    const server = createMcpServer(async () => posts)
    const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
    const listTool = tools.listStepIntoVisionPosts

    const result = await listTool.callback({ limit: 10, offset: 0 }, {})
    const structured = result.structuredContent as { resources?: Array<Record<string, unknown>> }
    expect(structured.resources).toBeDefined()
    expect(structured.resources).toHaveLength(2)

    for (const [index, resource] of structured.resources!.entries()) {
      expect(resource.annotations).toMatchObject({
        lastModified: new Date(posts[index].updatedAt).toISOString(),
      })
      const meta = resource._meta as { code?: { blocks?: unknown[] } }
      expect(meta).toBeDefined()
      expect(meta.code?.blocks).toBeDefined()
      expect(meta.code?.blocks?.length ?? 0).toBeGreaterThan(0)
    }
  })

  it("exposes markdown _meta with code blocks via resource templates", async () => {
    const post = normalizeWordPressPost(createSampleWordPressPost() as never)
    const server = createMcpServer(async () => [post])

    const templates = (server as unknown as {
      _registeredResourceTemplates: Record<
        string,
        {
          resourceTemplate: { listCallback?: (extra: unknown) => Promise<unknown> }
          readCallback: (uri: URL, params: Record<string, unknown>) => Promise<unknown>
        }
      >
    })._registeredResourceTemplates

    const markdownTemplate = templates.stepIntoVisionPost
    expect(markdownTemplate).toBeDefined()

    expect(markdownTemplate.resourceTemplate.listCallback).toBeTypeOf("function")

    const listResult = (await markdownTemplate.resourceTemplate.listCallback!({})) as {
      resources: Array<Record<string, unknown>>
    }
    expect(Array.isArray(listResult.resources)).toBe(true)
    const [resource] = listResult.resources
    expect(resource).toBeDefined()
    expect(resource.uri).toBe(`stepintovision://post/${post.slug}`)
    expect(resource.annotations).toMatchObject({
      lastModified: new Date(post.updatedAt).toISOString(),
    })
    const meta = resource._meta as Record<string, unknown>
    expect(meta).toMatchObject({
      canonicalUrl: post.link,
      metaUri: `stepintovision://post/${post.slug}/meta`,
      contentDigest: post.contentDigest,
      code: { policy: "verbatim" },
    })
    const codeBlocks = ((meta.code as { blocks?: unknown[] })?.blocks ?? []) as unknown[]
    expect(codeBlocks.length).toBeGreaterThan(0)

    const readResult = (await markdownTemplate.readCallback(new URL(resource.uri as string), {
      slug: post.slug,
    })) as { contents: Array<Record<string, unknown>> }

    expect(readResult.contents).toHaveLength(1)
    const [content] = readResult.contents
    expect(content._meta).toMatchObject({
      canonicalUrl: post.link,
      metaUri: `stepintovision://post/${post.slug}/meta`,
      code: { policy: "verbatim" },
      contentDigest: post.contentDigest,
    })
  })
})

