import "./dom-polyfill"

import { htmlToText } from "html-to-text"
import { load } from "cheerio"
import type { Element } from "domhandler"
import TurndownService from "turndown"
import { gfm } from "turndown-plugin-gfm"

import type {
  StepIntoVisionPost,
  StepIntoVisionSeeAlsoItem,
  StepIntoVisionMedia,
  StepIntoVisionLink,
  StepIntoVisionLinkRole,
  StepIntoVisionStatus,
  StepIntoVisionReferenceRole,
} from "./types"
import {
  analyzeMarkdown,
  canonicalizeMarkdown,
  ensureCodeFenceLanguages,
  extractKeywordCandidates,
  normalizeMarkdownProse,
  tokenizeKeywordText,
} from "./markdown-utils"
import { buildRenderedPostMarkdown } from "./markdown"
import { inferCodeLanguage } from "./code-language"

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

interface WordPressAuthor {
  name?: string
}

interface WordPressEmbedded {
  [key: string]: unknown
  "wp:term"?: WordPressEmbeddedTerm[][]
  "wp:featuredmedia"?: WordPressMedia[]
  author?: WordPressAuthor[]
}

interface WordPressPost {
  id: number
  slug: string
  link: string
  date: string
  modified: string
  author?: number
  title: WordPressRenderedField
  excerpt: WordPressRenderedField
  content: WordPressRenderedField
  categories?: number[]
  tags?: number[]
  _embedded?: WordPressEmbedded
}

const DEFAULT_BASE_URL = "https://stepinto.vision"
const USER_AGENT = "stepinto-vision-ingest/1.0 (+https://stepinto.vision)"
const DEFAULT_LOCALE = "en"
const DEFAULT_LICENSE = "AllRightsReserved"
const DEFAULT_AUTHOR = "Step Into Vision"
const MONTH_LOOKUP: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
}

const turndown = new TurndownService({
  codeBlockStyle: "fenced",
  headingStyle: "atx",
})
turndown.use(gfm)

const API_REFERENCE_PATTERNS: Array<{
  pattern: RegExp
  title: string
  url: string
}> = [
  {
    pattern: /\bModel3D\b/,
    title: "Model3D",
    url: "https://developer.apple.com/documentation/realitykit/model3d/",
  },
  {
    pattern: /\bModel3D\.Phase\b/,
    title: "Model3D.Phase",
    url: "https://developer.apple.com/documentation/realitykit/model3d/phase",
  },
  {
    pattern: /\bResolvedModel3D\b/,
    title: "ResolvedModel3D",
    url: "https://developer.apple.com/documentation/realitykit/resolvedmodel3d",
  },
]

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

  const prepared = prepareContent(post.content.rendered, {
    publishedAt: post.date,
    updatedAt: post.modified,
  })
  const contentHtml = prepared.html
  const contentMarkdown = prepared.markdown
  const contentText = prepared.text
  const seeAlso = prepared.seeAlso
  const references = prepared.references
  const mediaItems = prepared.media
  const links = prepared.links
  const videoUrl = prepared.videoUrl
  const assetSourceUrl = prepared.assetSourceUrl
  const assetAuthor = prepared.assetAuthor
  const assetLicense = inferAssetLicense(assetSourceUrl, prepared.assetLicense)
  const status = prepared.status
  const media = buildMediaList(heroImage, mediaItems)
  const authorName = extractAuthorName(post)
  const wordCount = prepared.wordCount
  const tokenCount = Math.max(1, Math.round(wordCount * 1.3))
  const readingTimeSeconds = Math.max(30, Math.round((wordCount / 200) * 60))

  const excerptHtml = sanitizeHtml(post.excerpt.rendered)
  const rawExcerpt = htmlToText(excerptHtml, {
    wordwrap: false,
    selectors: [{ selector: "a", options: { ignoreHref: true } }],
    preserveNewlines: false,
  })
    .replace(/\s+/g, " ")
    .trim()
  const excerpt = applyGrammarFixesToProse(rawExcerpt)
  const excerptChanged = excerpt !== rawExcerpt

  const normalized = prepared.proseNormalized || excerptChanged
  const normalizedScope = normalized ? "prose" : "none"

  const normalizedPost: StepIntoVisionPost = {
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
    link: cleanUrl(post.link) ?? post.link,
    publishedAt: post.date,
    updatedAt: post.modified,
    categories: dedupeStrings(categories),
    tags: dedupeStrings(tags),
    heroImage,
    media,
    locale: DEFAULT_LOCALE,
    author: authorName,
    license: DEFAULT_LICENSE,
    version: 1,
    normalized,
    verbatim: false,
    normalizedScope,
    seeAlso,
    references,
    links,
    contentDigest: "",
    videoUrl,
    assetSourceUrl,
    assetAuthor,
    assetLicense,
    code: { policy: "verbatim", blocks: [] },
    status,
  }

  const rendered = buildRenderedPostMarkdown(normalizedPost)
  normalizedPost.code = rendered.code
  normalizedPost.contentDigest = rendered.contentDigest

  return normalizedPost
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
    if (parsed.hash) {
      const lowerHash = parsed.hash.toLowerCase()
      const shouldStripHash =
        lowerHash === "#" ||
        lowerHash.startsWith("#?") ||
        lowerHash.includes("secret=") ||
        lowerHash.includes("login") ||
        lowerHash.includes("si=") ||
        parsed.hostname.toLowerCase().includes("forums.developer.apple.com")
      if (shouldStripHash) {
        parsed.hash = ""
      }
    }
    const result = parsed.toString()
    return result.endsWith("#") ? result.slice(0, -1) : result
  } catch {
    return url
  }
}

function normalizeHeroImage(media?: WordPressMedia): StepIntoVisionMedia | null {
  if (!media?.source_url) {
    return null
  }

  const url = cleanUrl(media.source_url) ?? media.source_url
  const alt = media.alt_text?.trim()

  if (!alt) {
    return null
  }

  return {
    role: "hero",
    url,
    alt,
    width: media.media_details?.width ?? null,
    height: media.media_details?.height ?? null,
  }
}

function applyGrammarFixesToProse(value: string): string {
  return value
    .replace(/ways to values convert/gi, "ways to convert values")
    .replace(/\bxtension\b/gi, "extension")
    .replace(/USD\s+(or\s+`?\.reality`?)/gi, (_match, suffix) => `USDZ ${suffix}`)
    .replace(/\bThis use\b/gi, (match) =>
      match[0] === "T" ? "This uses" : "this uses",
    )
    .replace(/\bI suggest you this article first\b/gi, (match) =>
      match[0] === "I" ? "Read this article first" : "read this article first",
    )
    .replace(/using\s+spatialOverlay\s+wrap/gi, (match) =>
      match[0] === "U"
        ? "Using .spatialOverlay, wrap"
        : "using .spatialOverlay, wrap",
    )
    .replace(/mark the ([^.,;]+?) and resizable/gi, (match, subject: string) => {
      const prefix = match[0] === "M" ? "Mark" : "mark"
      return `${prefix} the ${normalizeResizableSubject(subject)} as resizable`
    })
    .replace(/mark the ([^.,;]+?) as resizable/gi, (match, subject: string) => {
      const prefix = match[0] === "M" ? "Mark" : "mark"
      return `${prefix} the ${normalizeResizableSubject(subject)} as resizable`
    })
    .replace(/\\`/g, "`")
}

function normalizeResizableSubject(subject: string): string {
  return subject.replace(/\bearth\b/gi, "Earth").trim()
}

interface PrepareContentContext {
  publishedAt?: string
  updatedAt?: string
}

interface PreparedContent {
  html: string
  markdown: string
  text: string
  wordCount: number
  seeAlso: StepIntoVisionSeeAlsoItem[]
  references: StepIntoVisionSeeAlsoItem[]
  media: StepIntoVisionMedia[]
  links: StepIntoVisionLink[]
  videoUrl: string | null
  assetSourceUrl: string | null
  assetAuthor: string | null
  assetLicense: string | null
  status: StepIntoVisionStatus | null
  proseNormalized: boolean
}

function prepareContent(rawHtml: string, context: PrepareContentContext = {}): PreparedContent {
  const $ = load(rawHtml)

  $("script, style").remove()
  $("span.code-block-pro-copy-button").remove()

  const seeAlsoItems: StepIntoVisionSeeAlsoItem[] = []
  const mediaItems: StepIntoVisionMedia[] = []

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
    let codeTextRaw = textarea.text().replace(/\r\n/g, "\n")
    if (!codeTextRaw.trim()) {
      const codeElement = $(element).find("pre code").first()
      codeTextRaw = codeElement.text().replace(/\r\n/g, "\n")
    }
    if (!codeTextRaw.trim()) {
      $(element).remove()
      return
    }
    const codeText = stripTrailingBlankLines(codeTextRaw)
    let language = inferCodeLanguage(codeText)
    if (!language) {
      const codeElement = $(element).find("code").first()
      const classAttr = codeElement.attr("class") ?? ""
      const match = classAttr.match(/language-([a-z0-9]+)/i)
      if (match) {
        language = match[1]
      }
    }
    const replacement = `<pre><code class="language-${language ?? "text"}">${escapeHtml(codeText)}</code></pre>`
    $(element).replaceWith(replacement)
  })

  $("pre code").each((_, element) => {
    let codeTextRaw = $(element).text().replace(/\r\n/g, "\n")
    if (!codeTextRaw.trim()) {
      $(element).parent("pre").remove()
      return
    }

    const codeText = stripTrailingBlankLines(codeTextRaw)
    let language = inferCodeLanguage(codeText)
    if (!language) {
      const classAttr = $(element).attr("class") ?? ""
      const match = classAttr.match(/language-([a-z0-9]+)/i)
      if (match) {
        language = match[1].toLowerCase()
      }
    }
    $(element).text(codeText)

    if (language) {
      $(element).attr("class", `language-${language}`)
    } else {
      $(element).removeAttr("class")
    }
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

    const figure = $(element).closest("figure")
    const caption = figure.find("figcaption").first().text().trim()
    let trimmedAlt = alt?.trim() ?? ""
    if (!trimmedAlt && caption) {
      trimmedAlt = caption
    }

    if (!trimmedAlt) {
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

    if (cleanSrc) {
      mediaItems.push({
        role: "illustration",
        url: cleanSrc,
        alt: trimmedAlt,
        width: width ? parseDimension(width) : null,
        height: height ? parseDimension(height) : null,
      })
    }
  })

  const developerLinks = collectDeveloperLinks($)
  const assetData = collectAssetMetadata($)
  const videoDetails = collectVideoDetails($)
  const videoUrl = videoDetails.url
  const videoTitle = videoDetails.title

  const status = extractStatus($, context)

  const cleanedHtml = $.root().html()?.trim() ?? ""

  let markdown = turndown.turndown(cleanedHtml).trim()
  markdown = canonicalizeMarkdown(markdown)
  const normalizedMarkdown = normalizeMarkdownProse(markdown, applyGrammarFixesToProse)
  markdown = normalizedMarkdown.markdown
  markdown = ensureCodeFenceLanguages(markdown)
  markdown = canonicalizeMarkdown(markdown)
  const analysis = analyzeMarkdown(markdown)

  const baseReferences = collectReferenceLinks($)
  const references = augmentReferencesWithApiMentions(baseReferences, markdown)
  let links = filterLinksAgainstReferences(developerLinks, references)

  if (videoUrl) {
    const videoLink = buildVideoLink(videoUrl, videoTitle)
    links = links.filter((link) => link.role !== "video")
    links = dedupeLinks([...links, videoLink])
  }

  return {
    html: cleanedHtml,
    markdown,
    text: analysis.text,
    wordCount: analysis.wordCount,
    seeAlso: dedupeSeeAlso(seeAlsoItems),
    references,
    media: dedupeMedia(mediaItems),
    links,
    videoUrl,
    assetSourceUrl: assetData.assetSourceUrl,
    assetAuthor: assetData.assetAuthor,
    assetLicense: assetData.assetLicense,
    status,
    proseNormalized: normalizedMarkdown.changed,
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function stripTrailingBlankLines(value: string): string {
  return value.replace(/(?:[ \t]*\n)*[ \t]*$/u, (match) => (match.includes("\n") ? "" : match))
}

function isInternalHost(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  return (
    lower === "stepinto.vision" ||
    lower.endsWith(".stepinto.vision") ||
    lower === "stepintovision.ai" ||
    lower.endsWith(".stepintovision.ai")
  )
}

function inferReferenceRole(hostname: string): StepIntoVisionReferenceRole {
  const lower = hostname.toLowerCase()
  if (lower.includes("developer.apple.com") || lower.includes("docs.swift.org")) {
    return "docs"
  }
  if (lower.includes("forums.developer.apple.com")) {
    return "discussion"
  }
  if (
    lower.includes("youtube.com") ||
    lower.includes("youtu.be") ||
    lower.includes("vimeo.com")
  ) {
    return "video"
  }
  return "article"
}

function collectReferenceLinks($: ReturnType<typeof load>): StepIntoVisionSeeAlsoItem[] {
  const links: StepIntoVisionSeeAlsoItem[] = []

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href")?.trim()
    if (!href) {
      return
    }

    const normalizedHref = cleanUrl(href)
    if (!normalizedHref) {
      return
    }

    let hostname: string | null = null
    try {
      hostname = new URL(normalizedHref).hostname.toLowerCase()
    } catch {
      hostname = null
    }

    if (!hostname || isInternalHost(hostname)) {
      return
    }

    const rawTitle = $(element).text().trim()
    const title = deriveReferenceTitle($, element as Element, normalizedHref, rawTitle)
    const linkRole = determineLinkRole(hostname, normalizedHref)

    if (linkRole === "repo" || linkRole === "download" || linkRole === "series" || linkRole === "asset" || linkRole === "video") {
      return
    }

    let role: StepIntoVisionReferenceRole
    if (linkRole === "docs" || linkRole === "discussion") {
      role = linkRole
    } else {
      role = inferReferenceRole(hostname)
    }

    links.push({
      title,
      url: normalizedHref,
      role,
      sourceType: "thirdParty",
      rel: "supporting",
    })
  })

  return dedupeSeeAlso(links)
}

const GENERIC_REFERENCE_TITLE_PATTERNS = [
  /^article$/i,
  /^this\s+article$/i,
  /^this\s+article\s+first$/i,
  /^article\s+first$/i,
  /^this\s+write-?up$/i,
  /^write-?up$/i,
  /^this\s+post$/i,
  /^the\s+article$/i,
  /^original\s+article$/i,
]

const POSSESSIVE_PREFIX_STOPWORDS = new Set(["see", "read", "watch", "check"])

function deriveReferenceTitle(
  $: ReturnType<typeof load>,
  element: Element,
  url: string,
  rawTitle: string,
): string {
  const trimmed = rawTitle.trim()
  const slugTitle = titleFromUrl(url)
  const possessor = extractPossessiveName($, element)
  const needsSlug = !trimmed || isGenericReferenceTitle(trimmed)

  let title = needsSlug ? slugTitle ?? trimmed ?? url : trimmed

  if (possessor) {
    const lowerTitle = title.toLowerCase()
    if (!lowerTitle.includes(possessor.toLowerCase())) {
      title = `${title} (${possessor})`
    }
  }

  return title?.trim() || slugTitle || url
}

function isGenericReferenceTitle(value: string): boolean {
  const lower = value.trim().toLowerCase()
  if (!lower) {
    return true
  }
  return GENERIC_REFERENCE_TITLE_PATTERNS.some((pattern) => pattern.test(lower))
}

function titleFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const segments = parsed.pathname.split("/").filter(Boolean)
    if (segments.length === 0) {
      return null
    }
    let last = segments[segments.length - 1] ?? ""
    if (!last && segments.length > 1) {
      last = segments[segments.length - 2] ?? ""
    }
    if (!last) {
      return null
    }
    const withoutExt = last.replace(/\.[a-z0-9]+$/i, "")
    const decoded = decodeURIComponent(withoutExt)
    const normalized = decoded.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim()
    if (!normalized) {
      return null
    }
    return normalized
      .split(" ")
      .map((word) => {
        if (!word) {
          return word
        }
        if (/^[A-Z0-9]+$/.test(word)) {
          return word.toUpperCase()
        }
        return word[0].toUpperCase() + word.slice(1)
      })
      .join(" ")
  } catch {
    return null
  }
}

function extractPossessiveName(
  $: ReturnType<typeof load>,
  element: Element,
): string | null {
  const parent = element.parent
  if (!parent) {
    return null
  }
  const parentText = $(parent).text()
  const anchorText = $(element).text()
  const index = parentText.indexOf(anchorText)
  if (index <= 0) {
    return null
  }
  const before = parentText.slice(0, index).trimEnd()
  const match = before.match(/([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)'s$/)
  if (!match) {
    return null
  }
  const parts = match[1]?.trim().split(/\s+/) ?? []
  while (parts.length > 1 && POSSESSIVE_PREFIX_STOPWORDS.has(parts[0].toLowerCase())) {
    parts.shift()
  }
  const candidate = parts.join(" ").trim()
  if (candidate) {
    return candidate
  }
  return match[1]?.trim() ?? null
}

function augmentReferencesWithApiMentions(
  base: StepIntoVisionSeeAlsoItem[],
  markdown: string,
): StepIntoVisionSeeAlsoItem[] {
  const matches: StepIntoVisionSeeAlsoItem[] = []
  for (const candidate of API_REFERENCE_PATTERNS) {
    if (candidate.pattern.test(markdown)) {
      matches.push({
        title: candidate.title,
        url: candidate.url,
        role: "docs",
        sourceType: "thirdParty",
        rel: "supporting",
      })
    }
  }

  if (matches.length === 0) {
    return dedupeSeeAlso(base)
  }

  return dedupeSeeAlso([...base, ...matches])
}

function dedupeSeeAlso(items: StepIntoVisionSeeAlsoItem[]): StepIntoVisionSeeAlsoItem[] {
  const seen = new Set<string>()
  const result: StepIntoVisionSeeAlsoItem[] = []
  for (const item of items) {
    const key = `${item.title}|${item.url}|${item.role ?? ""}|${item.sourceType ?? ""}|${item.rel ?? ""}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(item)
    }
  }
  return result
}

function dedupeLinks(items: StepIntoVisionLink[]): StepIntoVisionLink[] {
  const seen = new Set<string>()
  const result: StepIntoVisionLink[] = []
  for (const item of items) {
    const key = `${item.role}|${item.url}|${item.sourceType ?? ""}|${item.rel ?? ""}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(item)
    }
  }
  return result
}

function filterLinksAgainstReferences(
  links: StepIntoVisionLink[],
  references: StepIntoVisionSeeAlsoItem[],
): StepIntoVisionLink[] {
  if (references.length === 0) {
    return links
  }
  const referenceRoles = new Map<string, Set<string>>()
  for (const reference of references) {
    const roles = referenceRoles.get(reference.url) ?? new Set<string>()
    roles.add(reference.role ?? "")
    referenceRoles.set(reference.url, roles)
  }

  return links.filter((link) => {
    const roles = referenceRoles.get(link.url)
    if (!roles) {
      return true
    }
    if (roles.has("")) {
      return false
    }
    return !roles.has(link.role)
  })
}

const GENERIC_VIDEO_TITLE_PATTERNS = [
  /^videopress\b/i,
  /^video\s*player$/i,
  /^watch\s*this\s*video$/i,
]

function buildVideoLink(url: string, title?: string | null): StepIntoVisionLink {
  let hostname: string | null = null
  try {
    hostname = new URL(url).hostname.toLowerCase()
  } catch {
    hostname = null
  }

  const resolvedRole = hostname ? determineLinkRole(hostname, url) ?? "video" : "video"
  const sourceType = hostname && isInternalHost(hostname) ? "firstParty" : "thirdParty"
  const entry: StepIntoVisionLink = {
    role: resolvedRole === "video" ? "video" : resolvedRole,
    url,
    sourceType: sourceType ?? "thirdParty",
    rel: "supporting",
  }

  let label = title?.trim() ?? ""
  if (label) {
    const normalized = label.toLowerCase()
    if (GENERIC_VIDEO_TITLE_PATTERNS.some((pattern) => pattern.test(normalized))) {
      label = ""
    }
  }
  if (!label) {
    label = "Video demo"
  }

  if (label) {
    entry.title = label
  }

  return entry
}

function parseDimension(value: string): number | null {
  const numeric = Number.parseInt(value, 10)
  return Number.isNaN(numeric) ? null : numeric
}

function determineLinkRole(
  hostname: string,
  href: string,
): StepIntoVisionLinkRole | null {
  const lowerHost = hostname.toLowerCase()
  const lowerHref = href.toLowerCase()

  if (lowerHost.includes("github.com")) {
    return lowerHref.endsWith(".zip") || lowerHref.includes("/archive/")
      ? "download"
      : "repo"
  }
  if (lowerHost.includes("forums.developer.apple.com")) {
    return "discussion"
  }
  if (lowerHost.includes("developer.apple.com")) {
    return "docs"
  }
  if (
    lowerHost.includes("youtube.com") ||
    lowerHost.includes("youtu.be") ||
    lowerHost.includes("vimeo.com")
  ) {
    return "video"
  }
  if (lowerHost.includes("opengameart.org")) {
    return "asset"
  }
  if (lowerHost.endsWith("stepinto.vision") && lowerHref.includes("/learn-visionos")) {
    return "series"
  }

  return null
}

function collectDeveloperLinks($: ReturnType<typeof load>): StepIntoVisionLink[] {
  const links: StepIntoVisionLink[] = []

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href")?.trim()
    if (!href) {
      return
    }

    const normalizedHref = cleanUrl(href)
    if (!normalizedHref) {
      return
    }

    let hostname: string | null = null
    try {
      hostname = new URL(normalizedHref).hostname.toLowerCase()
    } catch {
      hostname = null
    }

    if (!hostname) {
      return
    }

    const text = $(element).text().trim()
    const title = text || normalizedHref

    const role = determineLinkRole(hostname, normalizedHref)
    if (!role || role === "asset") {
      return
    }

    const sourceType = isInternalHost(hostname) ? "firstParty" : "thirdParty"
    const entry: StepIntoVisionLink = {
      role,
      url: normalizedHref,
      sourceType,
      rel: role === "series" && sourceType === "firstParty" ? "canonical" : "supporting",
    }
    if (title) {
      entry.title = title
    }
    links.push(entry)
  })

  return dedupeLinks(links)
}

function normalizeVersion(version: string): string {
  const trimmed = version.trim()
  if (!trimmed) {
    return trimmed
  }
  if (/^\d+$/.test(trimmed)) {
    return `${trimmed}.x`
  }
  return trimmed
}

function toIsoDate(value?: string): string | undefined {
  if (!value) {
    return undefined
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }
  return date.toISOString()
}

function parseAsOfDate(text: string, fallback?: string): string | undefined {
  const isoMatch = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)
  if (isoMatch) {
    const parsed = new Date(`${isoMatch[1]}T00:00:00Z`)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString()
    }
  }

  const monthDayParts = text.match(/As of\s+([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/i)
  if (monthDayParts) {
    const [, monthNameRaw, dayRaw, yearRaw] = monthDayParts
    const monthName = monthNameRaw.toLowerCase()
    const monthIndex = MONTH_LOOKUP[monthName as keyof typeof MONTH_LOOKUP]
    const day = Number.parseInt(dayRaw, 10)
    const year = Number.parseInt(yearRaw, 10)
    if (
      typeof monthIndex === "number" &&
      Number.isInteger(day) &&
      day >= 1 &&
      day <= 31 &&
      Number.isInteger(year)
    ) {
      const parsed = new Date(Date.UTC(year, monthIndex, day))
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString()
      }
    }
  }

  const monthDayMatch = text.match(/As of\s+([A-Za-z]+\s+\d{1,2},?\s*\d{4})/i)
  if (monthDayMatch) {
    const parsed = new Date(monthDayMatch[1])
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString()
    }
  }

  const monthYearMatch = text.match(/As of\s+([A-Za-z]+)\s+(\d{4})/i)
  if (monthYearMatch) {
    const monthName = monthYearMatch[1].toLowerCase()
    const year = Number.parseInt(monthYearMatch[2], 10)
    const monthIndex = MONTH_LOOKUP[monthName as keyof typeof MONTH_LOOKUP]
    if (!Number.isNaN(year) && typeof monthIndex === "number") {
      const parsed = new Date(Date.UTC(year, monthIndex, 1))
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString()
      }
    }
  }

  return toIsoDate(fallback)
}

function extractStatus(
  $: ReturnType<typeof load>,
  context: PrepareContentContext,
): StepIntoVisionStatus | null {
  let note: string | null = null

  $("p, li").each((_, element) => {
    const text = $(element).text().trim()
    if (!text) {
      return
    }
    if (!/as of/i.test(text)) {
      return
    }
    if (!/(not supported|cannot|can't|isn't supported|not available)/i.test(text)) {
      return
    }
    note = text.replace(/\s+/g, " ").trim()
    return false
  })

  const noteText = note

  if (!noteText) {
    return null
  }

  const ensuredNote: string = noteText

  const status: StepIntoVisionStatus = {
    type: "limitation",
    stability: "likely_to_change",
    note: ensuredNote,
  }

  if (/visionos/i.test(ensuredNote)) {
    const versionMatch = ensuredNote.match(/visionos\s*([0-9][0-9.]*)/i)
    const appliesTo: StepIntoVisionStatus["appliesTo"] = { product: "visionOS" }
    if (versionMatch) {
      appliesTo.versions = [normalizeVersion(versionMatch[1])]
    }
    status.appliesTo = appliesTo
  }

  const asOf = parseAsOfDate(ensuredNote, context.updatedAt ?? context.publishedAt)
  if (asOf) {
    status.asOf = asOf
  }

  return status
}

interface AssetMetadata {
  assetSourceUrl: string | null
  assetAuthor: string | null
  assetLicense: string | null
}

function collectAssetMetadata($: ReturnType<typeof load>): AssetMetadata {
  let assetSourceUrl: string | null = null
  let assetAuthor: string | null = null
  let assetLicense: string | null = null

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href")?.trim()
    if (!href) {
      return
    }
    const normalizedHref = cleanUrl(href)
    if (!normalizedHref) {
      return
    }

    const lowerHref = normalizedHref.toLowerCase()
    if (!assetSourceUrl && lowerHref.includes("opengameart.org/content/")) {
      assetSourceUrl = normalizedHref
      const contextText = $(element).closest("p").text()
      if (/cc0/i.test(contextText)) {
        assetLicense = "CC0"
      }
    }

    if (!assetAuthor && lowerHref.includes("opengameart.org/users/")) {
      const text = $(element).text().trim()
      assetAuthor = text || normalizedHref.split("/").pop() || null
    }

    if (!assetLicense && /cc0/i.test($(element).text())) {
      assetLicense = "CC0"
    }
  })

  return { assetSourceUrl, assetAuthor, assetLicense }
}

function collectVideoDetails($: ReturnType<typeof load>): { url: string | null; title: string | null } {
  const iframe = $("iframe[src]").first()
  if (iframe.length === 0) {
    return { url: null, title: null }
  }
  const src = iframe.attr("src")?.trim()
  if (!src) {
    return { url: null, title: null }
  }
  const normalized = cleanUrl(src) ?? src
  let title = iframe.attr("title")?.trim() ?? null
  if (!title) {
    const figureCaption = iframe.closest("figure").find("figcaption").first().text().trim()
    title = figureCaption || null
  }
  return { url: normalized, title }
}

function extractAuthorName(post: WordPressPost): string {
  const embeddedAuthors = Array.isArray(post._embedded?.author)
    ? (post._embedded?.author as WordPressAuthor[])
    : []

  for (const author of embeddedAuthors) {
    const name = author?.name?.trim()
    if (name) {
      return name
    }
  }

  return DEFAULT_AUTHOR
}

function dedupeMedia(items: StepIntoVisionMedia[]): StepIntoVisionMedia[] {
  const seen = new Set<string>()
  const result: StepIntoVisionMedia[] = []
  for (const item of items) {
    const key = `${item.role}|${item.url}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(item)
    }
  }
  return result
}

function buildMediaList(
  heroImage: StepIntoVisionMedia | null,
  mediaItems: StepIntoVisionMedia[],
): StepIntoVisionMedia[] {
  const combined: StepIntoVisionMedia[] = []
  if (heroImage) {
    combined.push(heroImage)
  }
  combined.push(...mediaItems)
  return dedupeMedia(combined)
}

function inferAssetLicense(sourceUrl: string | null, current: string | null): string | null {
  if (current) {
    return current
  }
  if (!sourceUrl) {
    return null
  }
  if (sourceUrl.toLowerCase().includes("opengameart.org/")) {
    return "CC0"
  }
  return null
}
