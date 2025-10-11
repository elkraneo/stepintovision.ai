import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import { getPostById, getPostBySlug, listPosts, searchPosts } from "./catalog"
import { renderPostMarkdown } from "./markdown"
import type { StepIntoVisionPost } from "./types"

export function createMcpServer(loadPosts: () => Promise<StepIntoVisionPost[]>) {
  const server = new McpServer({
    name: "stepintovision.ai",
    version: "1.0.0",
  })

  server.registerResource(
    "stepIntoVisionPost",
    new ResourceTemplate("stepintovision://post/{slug}", { list: undefined }),
    {
      title: "Step Into Vision Post",
      description: "Retrieve Step Into Vision posts as Markdown",
    },
    async (uri, { slug }) => {
      const posts = await loadPosts()
      const post = getPostBySlug(posts, slug.toString())

      if (!post) {
        return {
          contents: [
            {
              uri: uri.href,
              text: `Post with slug ${slug.toString()} not found.`,
              mimeType: "text/plain",
            },
          ],
        }
      }

      return {
        contents: [
          {
            uri: uri.href,
            text: renderPostMarkdown(post),
            mimeType: "text/markdown",
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

      return {
        content: [
          {
            type: "text" as const,
            text:
              items.length === 0
                ? "No posts found for the requested filters."
                : items
                    .map(
                      (post) =>
                        `- ${post.title} (slug: ${post.slug}, published ${new Date(post.publishedAt).toISOString()})`,
                    )
                    .join("\n"),
          },
        ],
        structuredContent: {
          items: items.map((post) => ({
            id: post.id,
            slug: post.slug,
            title: post.title,
            excerpt: post.excerpt,
            publishedAt: post.publishedAt,
            updatedAt: post.updatedAt,
            link: post.link,
            categories: post.categories,
            tags: post.tags,
          })),
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

      const sections: string[] = []
      sections.push(`# ${post.title}`)
      sections.push(`Published: ${new Date(post.publishedAt).toISOString()}`)
      if (post.updatedAt && post.updatedAt !== post.publishedAt) {
        sections.push(`Updated: ${new Date(post.updatedAt).toISOString()}`)
      }
      if (post.categories.length > 0) {
        sections.push(`Categories: ${post.categories.join(", ")}`)
      }
      if (post.tags.length > 0) {
        sections.push(`Tags: ${post.tags.join(", ")}`)
      }
      sections.push("")
      sections.push(post.excerpt)

      if (includeText) {
        sections.push("")
        sections.push(post.contentText)
      }

      if (includeHtml) {
        sections.push("")
        sections.push("```html")
        sections.push(post.contentHtml)
        sections.push("```")
      }

      return {
        content: [
          {
            type: "text" as const,
            text: sections.join("\n"),
          },
        ],
        structuredContent: {
          post: {
            id: post.id,
            slug: post.slug,
            title: post.title,
            excerpt: post.excerpt,
            link: post.link,
            publishedAt: post.publishedAt,
            updatedAt: post.updatedAt,
            categories: post.categories,
            tags: post.tags,
            heroImage: post.heroImage ?? undefined,
            contentHtml: includeHtml ? post.contentHtml : undefined,
            contentText: includeText ? post.contentText : undefined,
          },
        },
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

      return {
        content: [
          {
            type: "text" as const,
            text:
              hits.length === 0
                ? `No results found for "${query}".`
                : hits
                    .map((hit, index) => `${index + 1}. ${hit.title} — ${hit.link}`)
                    .join("\n"),
          },
        ],
        structuredContent: {
          query,
          hits,
        },
      }
    },
  )

  return server
}

