import { htmlToText } from "html-to-text"

import type { StepIntoVisionPost } from "./types"

export interface WordPressIngestOptions {
  baseUrl?: string
  perPage?: number
  maxPages?: number
  modifiedAfter?: string
  signal?: AbortSignal
  delayMs?: number
}

interface WordPressRenderedField {
  rendered: string
}

interface WordPressEmbeddedTerm {
  id: number
  link: string
  name: string
  slug: string
  taxonomy: string
}

interface WordPressMedia {
  source_url?: string
}

interface WordPressPost {
  id: number
  slug: string
  link: string
  date: string
  modified: string
  title: WordPressRenderedField
  excerpt: WordPressRenderedField
  content: WordPressRenderedField
  categories?: number[]
  tags?: number[]
  _embedded?: {
    [key: string]: Array<WordPressEmbeddedTerm[] | WordPressMedia[]>
  }
}

const DEFAULT_BASE_URL = "https://stepinto.vision"
const USER_AGENT = "stepinto-vision-ingest/1.0 (+https://stepinto.vision)"

function buildWordPressPostsUrl(baseUrl: string): URL {
  const trimmed = baseUrl.trim()
  if (trimmed.length === 0) {
    throw new Error("Base URL cannot be empty")
  }

  if (trimmed.includes("/wp-json/")) {
    return new URL(trimmed)
  }

  return new URL("/wp-json/wp/v2/posts", trimmed)
}

const DEFAULT_PER_PAGE = 50
const DEFAULT_MAX_PAGES = 10

export async function fetchWordPressPosts(options: WordPressIngestOptions = {}): Promise<StepIntoVisionPost[]> {
  const {
    baseUrl = DEFAULT_BASE_URL,
    perPage = DEFAULT_PER_PAGE,
    maxPages = DEFAULT_MAX_PAGES,
    modifiedAfter,
    signal,
    delayMs = 0,
  } = options

  const posts: StepIntoVisionPost[] = []
  let totalPages: number | null = null

  for (let page = 1; page <= maxPages; page += 1) {
    const url = buildWordPressPostsUrl(baseUrl)
    url.searchParams.set("per_page", String(perPage))
    url.searchParams.set("page", String(page))
    url.searchParams.set("orderby", "modified")
    url.searchParams.set("order", "desc")
    url.searchParams.set("_embed", "true")
    // WordPress strips embedded taxonomy and media data when `_fields` is
    // present, even if `_embedded` is requested. Fetch the full payload so the
    // ingestion pipeline can populate categories, tags, and hero images.

    if (modifiedAfter) {
      url.searchParams.set("modified_after", modifiedAfter)
    }

    let response: Awaited<ReturnType<typeof fetch>>
    try {
      response = await fetch(url, {
        headers: {
          "Accept": "application/json",
          "User-Agent": USER_AGENT,
        },
        signal,
      })
    } catch (error) {
      throw new Error(`Failed to fetch WordPress posts from ${url}`, {
        cause: error instanceof Error ? error : undefined,
      })
    }

    if (!response.ok) {
      let message = `Failed to fetch WordPress posts: ${response.status} ${response.statusText}`
      try {
        const body = await response.json()
        if (body && typeof body === "object" && "message" in body && typeof body.message === "string") {
          message = `${message} — ${body.message}`
        }
      } catch (error) {
        if (error instanceof Error && error.message) {
          message = `${message} (response body was not JSON: ${error.message})`
        }
      }
      throw new Error(message)
    }

    const totalPagesHeader = response.headers.get("X-WP-TotalPages")
    if (totalPagesHeader) {
      const parsed = Number.parseInt(totalPagesHeader, 10)
      if (!Number.isNaN(parsed)) {
        totalPages = parsed
      }
    }

    const data = (await response.json()) as WordPressPost[]

    if (data.length === 0) {
      break
    }

    for (const raw of data) {
      posts.push(normalizeWordPressPost(raw))
    }

    if (totalPages !== null && page >= totalPages) {
      break
    }

    if (delayMs > 0 && page < maxPages) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  return posts
}

export function normalizeWordPressPost(post: WordPressPost): StepIntoVisionPost {
  const terms = Array.isArray(post._embedded?.["wp:term"])
    ? (post._embedded?.["wp:term"] as WordPressEmbeddedTerm[][])
    : []

  const categories: string[] = []
  const tags: string[] = []

  for (const group of terms) {
    if (!Array.isArray(group) || group.length === 0) {
      continue
    }

    const taxonomy = group[0]?.taxonomy
    if (taxonomy === "category") {
      for (const term of group) {
        if (term?.name) {
          categories.push(term.name)
        }
      }
    }

    if (taxonomy === "post_tag") {
      for (const term of group) {
        if (term?.name) {
          tags.push(term.name)
        }
      }
    }
  }

  if (categories.length === 0 && Array.isArray(post.categories)) {
    for (const categoryId of post.categories) {
      if (typeof categoryId === "number") {
        categories.push(String(categoryId))
      }
    }
  }

  if (tags.length === 0 && Array.isArray(post.tags)) {
    for (const tagId of post.tags) {
      if (typeof tagId === "number") {
        tags.push(String(tagId))
      }
    }
  }

  const mediaGroups = Array.isArray(post._embedded?.["wp:featuredmedia"])
    ? (post._embedded?.["wp:featuredmedia"] as WordPressMedia[])
    : []
  const heroImage = mediaGroups[0]?.source_url ?? null

  const contentHtml = sanitizeHtml(post.content.rendered)
  const excerptHtml = sanitizeHtml(post.excerpt.rendered)
  const contentText = htmlToText(contentHtml, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
    ],
    preserveNewlines: true,
  }).trim()

  return {
    id: post.id,
    slug: post.slug,
    title: decodeHtml(post.title.rendered).trim(),
    excerpt: htmlToText(excerptHtml, {
      wordwrap: false,
      selectors: [{ selector: "a", options: { ignoreHref: true } }],
      preserveNewlines: false,
    }).replace(/\s+/g, " ").trim(),
    contentHtml,
    contentText,
    link: post.link,
    publishedAt: post.date,
    updatedAt: post.modified,
    categories: Array.from(new Set(categories)),
    tags: Array.from(new Set(tags)),
    heroImage,
  }
}

const HTML_ENTITY_PATTERN = /&#(x?[0-9a-fA-F]+);/g
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
}

function decodeHtml(input: string): string {
  return input
    .replace(/&([a-zA-Z]+);/g, (match, entity) => {
      if (NAMED_ENTITIES[entity]) {
        return NAMED_ENTITIES[entity]
      }
      return match
    })
    .replace(HTML_ENTITY_PATTERN, (match, code) => {
      const isHex = code.startsWith("x") || code.startsWith("X")
      const numeric = Number.parseInt(isHex ? code.slice(1) : code, isHex ? 16 : 10)
      if (Number.isNaN(numeric)) {
        return match
      }
      return String.fromCodePoint(numeric)
    })
}

const SCRIPT_STYLE_PATTERN = /<(script|style)[^>]*>[\s\S]*?<\/\1>/gi

function sanitizeHtml(input: string): string {
  return input.replace(SCRIPT_STYLE_PATTERN, "")
}
