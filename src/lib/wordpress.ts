import { createHash } from "crypto"

import { htmlToText } from "html-to-text"
import { load } from "cheerio"
import TurndownService from "turndown"
import { gfm } from "turndown-plugin-gfm"

import type {
  StepIntoVisionPost,
  StepIntoVisionSeeAlsoItem,
  StepIntoVisionMedia,
} from "./types"

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

interface WordPressMediaDetails {
  width?: number
  height?: number
}

interface WordPressMedia {
  source_url?: string
  alt_text?: string
  media_details?: WordPressMediaDetails
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
const DEFAULT_LOCALE = "en"
const DEFAULT_LICENSE = "All rights reserved"
const DEFAULT_AUTHOR = "Step Into Vision"

const turndown = new TurndownService({
  codeBlockStyle: "fenced",
  headingStyle: "atx",
})
turndown.use(gfm)

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
    if (!Array.isArray(group)) {
      continue
    }

    for (const term of group) {
      if (!term) {
        continue
      }

      const name = term.name?.trim()
      if (!name) {
        continue
      }

      const taxonomy = term.taxonomy ?? inferTaxonomyFromLink(term.link)
      if (taxonomy === "category") {
        categories.push(name)
      } else if (taxonomy === "post_tag") {
        tags.push(name)
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
  const heroImage = normalizeHeroImage(mediaGroups[0])

  const prepared = prepareContent(post.content.rendered)
  const contentHtml = prepared.html
  const contentMarkdown = prepared.markdown
  const contentText = prepared.text
  const seeAlso = prepared.seeAlso
  const developerLinks = prepared.developerLinks
  const wordCount = contentText.split(/\s+/).filter(Boolean).length
  const tokenCount = Math.max(1, Math.round(wordCount * 1.3))
  const readingTimeSeconds = Math.max(30, Math.round((wordCount / 200) * 60))

  const excerptHtml = sanitizeHtml(post.excerpt.rendered)
  const excerpt = fixCommonGrammar(
    htmlToText(excerptHtml, {
      wordwrap: false,
      selectors: [{ selector: "a", options: { ignoreHref: true } }],
      preserveNewlines: false,
    })
      .replace(/\s+/g, " ")
      .trim(),
  )

  const contentDigest = createHash("sha256").update(contentMarkdown, "utf8").digest("hex")

  return {
    id: post.id,
    slug: post.slug,
    title: decodeHtml(post.title.rendered).trim(),
    excerpt,
    contentHtml,
    contentMarkdown,
    contentText,
    wordCount,
    tokenCount,
    readingTimeSeconds,
    link: post.link,
    publishedAt: post.date,
    updatedAt: post.modified,
    categories: dedupeStrings(categories),
    tags: dedupeStrings(tags),
    heroImage,
    locale: DEFAULT_LOCALE,
    author: DEFAULT_AUTHOR,
    license: DEFAULT_LICENSE,
    version: 1,
    seeAlso,
    developerLinks,
    contentDigest: `sha256-${contentDigest}`,
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

function inferTaxonomyFromLink(link: string): string | null {
  if (!link) {
    return null
  }

  if (link.includes("/category/")) {
    return "category"
  }
  if (link.includes("/tag/")) {
    return "post_tag"
  }
  return null
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>()
  for (const value of values) {
    if (value) {
      seen.add(value)
    }
  }
  return Array.from(seen)
}

function cleanUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined
  }

  try {
    const parsed = new URL(url)
    parsed.search = ""
    parsed.hash = ""
    return parsed.toString()
  } catch {
    return url
  }
}

function normalizeHeroImage(media?: WordPressMedia): StepIntoVisionMedia | null {
  if (!media?.source_url) {
    return null
  }

  return {
    role: "hero",
    url: cleanUrl(media.source_url) ?? media.source_url,
    alt: media.alt_text ?? null,
    width: media.media_details?.width ?? null,
    height: media.media_details?.height ?? null,
  }
}

function fixCommonGrammar(value: string): string {
  return value.replace(/ways to values convert/gi, "ways to convert values")
}

interface PreparedContent {
  html: string
  markdown: string
  text: string
  seeAlso: StepIntoVisionSeeAlsoItem[]
  developerLinks: StepIntoVisionSeeAlsoItem[]
}

function prepareContent(rawHtml: string): PreparedContent {
  const $ = load(rawHtml)

  $("script, style").remove()
  $("span.code-block-pro-copy-button").remove()

  const seeAlsoItems: StepIntoVisionSeeAlsoItem[] = []

  $("p").each((_, element) => {
    const text = $(element).text().trim().toLowerCase()
    if (text === "see also") {
      const list = $(element).nextAll("ul").first()
      if (list.length > 0) {
        list.find("a").each((__, anchor) => {
          const title = $(anchor).text().trim()
          const url = $(anchor).attr("href")?.trim()
          if (title && url) {
            seeAlsoItems.push({ title, url })
          }
        })
        list.remove()
      }
      $(element).remove()
    }
  })

  $("[style]").removeAttr("style")

  $("div.wp-block-kevinbatdorf-code-block-pro").each((_, element) => {
    const textarea = $(element).find("textarea").first()
    let codeText = textarea.text().replace(/\r\n/g, "\n").trim()
    if (!codeText) {
      const codeElement = $(element).find("pre code").first()
      codeText = codeElement.text().replace(/\r\n/g, "\n").trim()
    }
    if (!codeText) {
      $(element).remove()
      return
    }
    let language = inferCodeLanguage(codeText)
    if (!language) {
      const codeElement = $(element).find("code").first()
      const classAttr = codeElement.attr("class") ?? ""
      const match = classAttr.match(/language-([a-z0-9]+)/i)
      if (match) {
        language = match[1]
      }
    }

    if (language === "swift") {
      codeText = ensureSwiftImports(codeText)
    }

    const replacement = `<pre><code class="language-${language ?? "text"}">${escapeHtml(codeText)}</code></pre>`
    $(element).replaceWith(replacement)
  })

  $("[class]").each((_, element) => {
    const el = element as unknown as { attribs?: Record<string, string> }
    if (!el.attribs) {
      return
    }

    const value = el.attribs.class
    if (!value) {
      $(element).removeAttr("class")
      return
    }

    if (value.includes("language-")) {
      // Preserve language hint
      return
    }

    $(element).removeAttr("class")
  })

  $("*[data-attachment-id], *[data-permalink], *[data-orig-file], *[data-orig-size], *[data-comments-opened], *[data-image-meta], *[data-image-title], *[data-image-description], *[data-image-caption], *[data-medium-file], *[data-large-file], *[data-recalc-dims], *[data-id], *[data-type]").each((_, element) => {
    const attribs = (element as unknown as { attribs?: Record<string, string> }).attribs
    if (!attribs) {
      return
    }
    for (const key of Object.keys(attribs)) {
      if (key.startsWith("data-")) {
        $(element).removeAttr(key)
      }
    }
  })

  $("figure img").each((_, element) => {
    const src = $(element).attr("src")
    const alt = $(element).attr("alt") ?? null
    const width = $(element).attr("width") ?? null
    const height = $(element).attr("height") ?? null

    const cleanSrc = cleanUrl(src ?? undefined)
    if (cleanSrc) {
      $(element).attr("src", cleanSrc)
    }

    const trimmedAlt = alt?.trim() ?? ""
    if (!trimmedAlt) {
      const figure = $(element).closest("figure")
      if (figure.length > 0) {
        figure.remove()
        return
      }
      $(element).remove()
      return
    }

    if (alt !== trimmedAlt) {
      $(element).attr("alt", trimmedAlt)
    }

    if (width) {
      $(element).attr("width", width)
    }
    if (height) {
      $(element).attr("height", height)
    }
  })

  const cleanedHtml = fixCommonGrammar($.root().html()?.trim() ?? "")

  const markdown = turndown.turndown(cleanedHtml)
  const normalizedMarkdown = fixCommonGrammar(markdown.trim())

  const text = fixCommonGrammar(
    htmlToText(cleanedHtml, {
      wordwrap: false,
      selectors: [
        { selector: "a", options: { ignoreHref: true } },
        { selector: "img", format: "skip" },
      ],
      preserveNewlines: true,
    })
      .replace(/\s+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  )

  return {
    html: cleanedHtml,
    markdown: normalizedMarkdown,
    text,
    seeAlso: dedupeSeeAlso(seeAlsoItems),
    developerLinks: collectDeveloperLinks($),
  }
}

function inferCodeLanguage(code: string): string | null {
  const trimmed = code.trim()
  if (!trimmed) {
    return null
  }

  if (/\bimport\s+(SwiftUI|RealityKit|RealityKitContent)/.test(trimmed)) {
    return "swift"
  }
  if (/\bstruct\s+[A-Z]/.test(trimmed) && trimmed.includes(": View")) {
    return "swift"
  }
  if (/\bfunc\s+[a-zA-Z0-9_]+\s*\(/.test(trimmed) && trimmed.includes("->")) {
    return "swift"
  }
  if (/class\s+[A-Z]/.test(trimmed) && trimmed.includes("NSObject")) {
    return "swift"
  }
  return null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function ensureSwiftImports(code: string): string {
  let result = code.trim()
  const needsSwiftUI = !/\bimport\s+SwiftUI\b/.test(result) && /:\s*View\b/.test(result)
  const needsRealityKit = !/\bimport\s+RealityKit\b/.test(result) && /\bRealityKit\b/.test(result)
  const needsRealityKitContent =
    !/\bimport\s+RealityKitContent\b/.test(result) && /\bRealityKitContent\b/.test(result)

  const imports: string[] = []
  if (needsSwiftUI) {
    imports.push("import SwiftUI")
  }
  if (needsRealityKit) {
    imports.push("import RealityKit")
  }
  if (needsRealityKitContent) {
    imports.push("import RealityKitContent")
  }

  if (imports.length === 0) {
    return result
  }

  return `${imports.join("\n")}\n\n${result}`
}

function dedupeSeeAlso(items: StepIntoVisionSeeAlsoItem[]): StepIntoVisionSeeAlsoItem[] {
  const seen = new Set<string>()
  const result: StepIntoVisionSeeAlsoItem[] = []
  for (const item of items) {
    const key = `${item.title}|${item.url}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(item)
    }
  }
  return result
}

function collectDeveloperLinks($: ReturnType<typeof load>): StepIntoVisionSeeAlsoItem[] {
  const links: StepIntoVisionSeeAlsoItem[] = []
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href")?.trim()
    if (!href) {
      return
    }
    const normalizedHref = cleanUrl(href)
    if (!normalizedHref || !normalizedHref.includes("github.com")) {
      return
    }
    const title = $(element).text().trim() || normalizedHref
    links.push({ title, url: normalizedHref })
  })

  return dedupeSeeAlso(links)
}
