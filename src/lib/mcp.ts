import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import { getPostById, getPostBySlug, listPosts, searchPosts } from "./catalog"
import { renderPostMarkdown } from "./markdown"
import type { StepIntoVisionPost, StepIntoVisionPostMetaDocument } from "./types"

const MARKDOWN_MIME_TYPE = "text/markdown"
const JSON_MIME_TYPE = "application/json"

function toIsoString(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toISOString()
}

function buildResourceUri(post: StepIntoVisionPost): string {
  return `stepintovision://post/${post.slug}`
}

function buildMetaUri(post: StepIntoVisionPost): string {
  return `stepintovision://post/${post.slug}/meta`
}

function buildMarkdownName(post: StepIntoVisionPost): string {
  return `${post.slug}.md`
}

function buildMetaName(post: StepIntoVisionPost): string {
  return `${post.slug}.meta.json`
}

function buildResourceMeta(post: StepIntoVisionPost): Record<string, unknown> {
  const markdownUri = buildResourceUri(post)
  return {
    schema: "mcp.post.v1",
    canonicalUrl: post.link,
    markdownUri,
    metaUri: buildMetaUri(post),
    contentType: MARKDOWN_MIME_TYPE,
    publishedAt: toIsoString(post.publishedAt),
    updatedAt: toIsoString(post.updatedAt),
    author: { name: post.author },
    summary: post.excerpt,
    normalized: post.normalized,
    verbatim: post.verbatim,
    version: post.version,
    contentDigest: post.contentDigest,
  }
}

function buildResourceItem(post: StepIntoVisionPost) {
  return {
    uri: buildResourceUri(post),
    name: buildMarkdownName(post),
    title: post.title,
    description: post.excerpt,
    mimeType: MARKDOWN_MIME_TYPE,
    annotations: {
      audience: ["assistant"],
      priority: 0.8,
      lastModified: toIsoString(post.updatedAt),
    },
    _meta: buildResourceMeta(post),
  }
}

function buildMetaDocument(post: StepIntoVisionPost): StepIntoVisionPostMetaDocument {
  const markdownUri = buildResourceUri(post)
  const meta: StepIntoVisionPostMetaDocument = {
    schema: "mcp.post.v1",
    id: String(post.id),
    slug: post.slug,
    title: post.title,
    description: post.excerpt,
    summary: post.excerpt,
    locale: post.locale,
    canonicalUrl: post.link,
    markdownUri,
    publishedAt: toIsoString(post.publishedAt),
    updatedAt: toIsoString(post.updatedAt),
    categories: post.categories,
    tags: post.tags,
    author: { name: post.author },
    license: { type: post.license },
    contentType: MARKDOWN_MIME_TYPE,
    wordCount: post.wordCount,
    tokenCount: post.tokenCount,
    readingTimeSeconds: post.readingTimeSeconds,
    normalized: post.normalized,
    verbatim: post.verbatim,
    media: post.media.map((item) => ({
      role: item.role,
      url: item.url,
      alt: item.alt,
      ...(item.width ? { width: item.width } : {}),
      ...(item.height ? { height: item.height } : {}),
    })),
    seeAlso: post.seeAlso,
    references: post.references,
    links: post.links.map((link) => ({
      role: link.role,
      url: link.url,
      ...(link.title ? { title: link.title } : {}),
    })),
    version: post.version,
    contentDigest: post.contentDigest,
  }
  if (post.videoUrl) {
    meta.videoUrl = post.videoUrl
  }
  if (post.assetSourceUrl) {
    meta.assetSourceUrl = post.assetSourceUrl
  }
  if (post.assetAuthor) {
    meta.assetAuthor = post.assetAuthor
  }
  if (post.assetLicense) {
    meta.assetLicense = post.assetLicense
  }
  return meta
}

function buildMetaResourceItem(post: StepIntoVisionPost) {
  const metaDocument = buildMetaDocument(post)
  return {
    uri: buildMetaUri(post),
    name: buildMetaName(post),
    title: `${post.title} metadata`,
    description: `Structured metadata for ${post.title}`,
    mimeType: JSON_MIME_TYPE,
    annotations: {
      audience: ["assistant"],
      lastModified: metaDocument.updatedAt,
    },
    _meta: {
      canonicalUrl: metaDocument.canonicalUrl,
      markdownUri: metaDocument.markdownUri,
      schema: metaDocument.schema,
      contentDigest: metaDocument.contentDigest,
      version: metaDocument.version,
    },
  }
}

export function createMcpServer(loadPosts: () => Promise<StepIntoVisionPost[]>) {
  const server = new McpServer({
    name: "stepintovision.ai",
    version: "1.0.0",
  })

  const completeSlug = async (value: string) => {
    const posts = await loadPosts()
    const prefix = value?.toLowerCase() ?? ""
    return posts
      .map((post) => post.slug)
      .filter((slug) => !prefix || slug.toLowerCase().startsWith(prefix))
  }

  const postTemplate = new ResourceTemplate("stepintovision://post/{slug}", {
    list: async () => {
      const posts = await loadPosts()
      return {
        resources: posts.map(buildResourceItem),
        _meta: {
          total: posts.length,
        },
      }
    },
    complete: {
      slug: completeSlug,
    },
  })

  server.registerResource(
    "stepIntoVisionPost",
    postTemplate,
    {
      title: "Step Into Vision post (Markdown)",
      description: "AI-ready Markdown body for Step Into Vision articles.",
      mimeType: MARKDOWN_MIME_TYPE,
    },
    async (uri, { slug }) => {
      const posts = await loadPosts()
      const post = getPostBySlug(posts, slug.toString())

      if (!post) {
        return {
          contents: [
            {
              uri: uri.href,
              name: slug.toString(),
              title: `Missing post: ${slug.toString()}`,
              mimeType: "text/plain",
              text: `Post with slug "${slug.toString()}" not found.`,
            },
          ],
        }
      }

      return {
        contents: [
          {
            uri: uri.href,
            name: buildMarkdownName(post),
            title: post.title,
            mimeType: MARKDOWN_MIME_TYPE,
            text: renderPostMarkdown(post),
            _meta: buildResourceMeta(post),
          },
        ],
      }
    },
  )

  const metaTemplate = new ResourceTemplate("stepintovision://post/{slug}/meta", {
    list: async () => {
      const posts = await loadPosts()
      return {
        resources: posts.map(buildMetaResourceItem),
        _meta: {
          total: posts.length,
        },
      }
    },
    complete: {
      slug: completeSlug,
    },
  })

  server.registerResource(
    "stepIntoVisionPostMeta",
    metaTemplate,
    {
      title: "Step Into Vision post metadata",
      description: "Structured metadata for Step Into Vision posts.",
      mimeType: JSON_MIME_TYPE,
    },
    async (uri, { slug }) => {
      const posts = await loadPosts()
      const post = getPostBySlug(posts, slug.toString())

      if (!post) {
        return {
          contents: [
            {
              uri: uri.href,
              name: slug.toString(),
              title: `Missing post metadata: ${slug.toString()}`,
              mimeType: "text/plain",
              text: `Post with slug "${slug.toString()}" not found.`,
            },
          ],
        }
      }

      const metaDocument = buildMetaDocument(post)
      return {
        contents: [
          {
            uri: uri.href,
            name: buildMetaName(post),
            title: `${post.title} metadata`,
            mimeType: JSON_MIME_TYPE,
            text: JSON.stringify(metaDocument, null, 2),
            _meta: {
              canonicalUrl: metaDocument.canonicalUrl,
              markdownUri: metaDocument.markdownUri,
              schema: metaDocument.schema,
              contentDigest: metaDocument.contentDigest,
              version: metaDocument.version,
            },
          },
        ],
      }
    },
  )

  server.registerTool(
    "listStepIntoVisionPosts",
    {
      title: "List Step Into Vision posts",
      description: "List the most recent Step Into Vision posts with optional filters",
      inputSchema: {
        limit: z.number().min(1).max(50).default(10),
        offset: z.number().min(0).default(0),
        category: z.string().optional(),
        tag: z.string().optional(),
      },
    },
    async ({ limit = 10, offset = 0, category, tag }) => {
      const posts = await loadPosts()
      const items = listPosts(posts, { limit, offset, category, tag })
      const resources = items.map(buildResourceItem)

      return {
        content: [
          {
            type: "text" as const,
            text:
              resources.length === 0
                ? "No posts found for the requested filters."
                : resources
                    .map((resource) => `- ${resource.title} — ${resource.uri}`)
                    .join("\n"),
          },
        ],
        structuredContent: {
          resources,
        },
      }
    },
  )

  server.registerTool(
    "getStepIntoVisionPost",
    {
      title: "Fetch a Step Into Vision post",
      description: "Retrieve a specific Step Into Vision post by slug or id",
      inputSchema: {
        slug: z.string().optional(),
        id: z.number().int().optional(),
        includeHtml: z.boolean().default(false),
        includeText: z.boolean().default(true),
      },
    },
    async ({ slug, id, includeHtml = false, includeText = true }) => {
      if (!slug && typeof id !== "number") {
        return {
          content: [
            {
              type: "text" as const,
              text: "Either slug or id must be provided.",
            },
          ],
        }
      }

      const posts = await loadPosts()
      const post = slug ? getPostBySlug(posts, slug) : getPostById(posts, id ?? -1)

      if (!post) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Post not found.",
            },
          ],
        }
      }

      const content = includeText
        ? [
            {
              type: "text" as const,
              text: renderPostMarkdown(post),
            },
          ]
        : [
            {
              type: "text" as const,
              text: `${post.title} — ${buildResourceUri(post)}`,
            },
          ]

      const structuredContent: Record<string, unknown> = {
        resource: buildResourceItem(post),
        metaResource: buildMetaResourceItem(post),
      }

      if (includeText) {
        structuredContent.text = post.contentText
      }

      if (includeHtml) {
        structuredContent.html = post.contentHtml
      }

      return {
        content,
        structuredContent,
      }
    },
  )

  server.registerTool(
    "searchStepIntoVisionPosts",
    {
      title: "Search Step Into Vision posts",
      description: "Keyword search across Step Into Vision posts",
      inputSchema: {
        query: z.string(),
        limit: z.number().min(1).max(25).default(10),
      },
    },
    async ({ query, limit = 10 }) => {
      const posts = await loadPosts()
      const hits = searchPosts(posts, query, limit)
      const postBySlug = new Map(posts.map((post) => [post.slug, post]))

      const resources = hits
        .map((hit) => postBySlug.get(hit.slug))
        .filter((post): post is StepIntoVisionPost => Boolean(post))
        .map(buildResourceItem)

      const lines =
        hits.length === 0
          ? `No results found for "${query}".`
          : hits
              .map((hit, index) => {
                const post = postBySlug.get(hit.slug)
                const uri = post ? buildResourceUri(post) : hit.link
                return `${index + 1}. ${hit.title} — ${uri}`
              })
              .join("\n")

      return {
        content: [
          {
            type: "text" as const,
            text: lines,
          },
        ],
        structuredContent: {
          query,
          hits: hits.map((hit) => ({
            ...hit,
            resource: postBySlug.get(hit.slug)
              ? buildResourceItem(postBySlug.get(hit.slug) as StepIntoVisionPost)
              : undefined,
          })),
          resources,
        },
      }
    },
  )

  return server
}
