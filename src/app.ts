import { StreamableHTTPTransport } from "@hono/mcp"
import { Hono } from "hono"
import type { Context } from "hono"
import { cors } from "hono/cors"
import { HTTPException } from "hono/http-exception"
import { trimTrailingSlash } from "hono/trailing-slash"

import type { CatalogLoader } from "./lib/catalog-loader"
import { listPosts, searchPosts } from "./lib/catalog"
import type { CatalogFile } from "./lib/types"
import type { StepIntoVisionPost } from "./lib/types"
import { renderPostMarkdown } from "./lib/markdown"
import { createMcpServer } from "./lib/mcp"

export interface StepIntoVisionBindings {
  STEPINTOVISION_CATALOG?: string
  STEPINTOVISION_CATALOG_KV?: KVNamespace
}

export interface CreateAppOptions {
  loader: CatalogLoader
  isDev?: boolean
}

export function createApp(options: CreateAppOptions) {
  const { loader, isDev = false } = options

  const app = new Hono<{ Bindings: StepIntoVisionBindings }>()
  const loadPosts = loader
  const mcpServer = createMcpServer(loadPosts)

  app.use(trimTrailingSlash())
  app.use("*", cors())

  app.use("*", async (c, next) => {
    await next()
    c.header("X-Content-Type-Options", "nosniff")
    c.header("X-Frame-Options", "DENY")
    c.header("X-XSS-Protection", "1; mode=block")
    c.header("Referrer-Policy", "strict-origin-when-cross-origin")
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    c.header("Vary", "Accept")
    if (isDev) {
      c.header("Cache-Control", "no-store")
    } else if (c.req.method === "GET") {
      c.header("Cache-Control", "public, max-age=300, s-maxage=1800")
    }
  })

  app.onError((err, c) => {
    console.error(err)
    if (err instanceof HTTPException) {
      return err.getResponse()
    }
    return c.json({ error: "Internal Server Error" }, 500)
  })

  app.notFound((c) => c.json({ error: "Not Found" }, 404))

  app.get("/", async (c) => {
    const catalog = await loadCatalogMetadata(loadPosts)
    return c.json({
      name: "stepintovision.ai",
      description: "AI-ready Step Into Vision catalog",
      items: catalog.metadata.itemCount,
      generatedAt: catalog.metadata.generatedAt,
      source: catalog.metadata.source,
      endpoints: {
        posts: "/posts",
        search: "/search",
        mcp: "/mcp",
      },
    })
  })

  app.get("/health", async (c) => {
    const posts = await loadPosts()
    return c.json({ status: "ok", posts: posts.length })
  })

  app.get("/posts", async (c) => {
    const limit = clampNumber(c.req.query("limit"), 1, 50, 10)
    const offset = clampNumber(c.req.query("offset"), 0, Number.POSITIVE_INFINITY, 0)
    const category = c.req.query("category") ?? undefined
    const tag = c.req.query("tag") ?? undefined

    const posts = await loadPosts()
    const items = listPosts(posts, { limit, offset, category, tag })

    return c.json({
      metadata: {
        total: posts.length,
        limit,
        offset,
        category: category ?? null,
        tag: tag ?? null,
      },
      items,
    })
  })

  app.get("/posts/id/:id", async (c) => {
    const rawId = c.req.param("id")
    const id = Number.parseInt(rawId, 10)
    if (Number.isNaN(id)) {
      throw new HTTPException(400, { message: "Invalid post id" })
    }

    const posts = await loadPosts()
    const post = posts.find((entry) => entry.id === id)
    if (!post) {
      throw new HTTPException(404, { message: "Post not found" })
    }

    return respondWithPost(c, post)
  })

  app.get("/posts/:slug", async (c) => {
    const slug = c.req.param("slug")
    const posts = await loadPosts()
    const post = posts.find((entry) => entry.slug === slug)
    if (!post) {
      throw new HTTPException(404, { message: "Post not found" })
    }

    return respondWithPost(c, post)
  })

  app.get("/search", async (c) => {
    const query = c.req.query("q") ?? ""
    const limit = clampNumber(c.req.query("limit"), 1, 25, 10)

    if (!query.trim()) {
      throw new HTTPException(400, { message: "Missing search query (?q=...)" })
    }

    const posts = await loadPosts()
    const hits = searchPosts(posts, query, limit)

    return c.json({
      query,
      limit,
      hits,
    })
  })

  app.get("/*", async (c) => {
    const path = c.req.path
    const segments = path.split("/").filter(Boolean)
    if (segments.length === 0) {
      throw new HTTPException(404, { message: "Post not found" })
    }

    const slug = segments[segments.length - 1]
    const posts = await loadPosts()
    const post = posts.find((entry) => entry.slug === slug)
    if (!post) {
      throw new HTTPException(404, { message: "Post not found" })
    }

    return c.text(renderPostMarkdown(post), 200, {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Location": post.link,
      Link: `<${post.link}>; rel="canonical"`,
    })
  })

  app.all("/mcp", async (c) => {
    const transport = new StreamableHTTPTransport()
    await mcpServer.connect(transport)
    return transport.handleRequest(c)
  })

  return app
}

function clampNumber(value: string | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return fallback
  const lowerBound = Math.max(parsed, min)
  return Number.isFinite(max) ? Math.min(lowerBound, max) : lowerBound
}

async function loadCatalogMetadata(loader: CatalogLoader): Promise<CatalogFile> {
  if (typeof loader.loadCatalog === "function") {
    return loader.loadCatalog()
  }

  const posts = await loader()
  return {
    metadata: {
      source: "https://stepinto.vision",
      generatedAt: new Date(0).toISOString(),
      itemCount: posts.length,
    },
    posts,
  }
}

function respondWithPost(c: Context, post: StepIntoVisionPost) {
  const accept = c.req.header("Accept") ?? "application/json"
  if (accept.includes("text/markdown")) {
    return c.text(renderPostMarkdown(post), 200, {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Location": post.link,
    })
  }

  return c.json(post)
}

export type App = ReturnType<typeof createApp>
