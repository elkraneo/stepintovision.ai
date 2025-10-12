import { createHash } from "node:crypto"

import {
  analyzeMarkdown,
  canonicalizeMarkdown,
  ensureCodeFenceLanguages,
  extractKeywordCandidates,
  tokenizeKeywordText,
} from "./markdown-utils"
import type {
  StepIntoVisionLicense,
  StepIntoVisionLink,
  StepIntoVisionLinkRole,
  StepIntoVisionLicenseType,
  StepIntoVisionPostMetaDocument,
} from "./types"
import stringify from "json-stable-stringify"

export interface GeneratePostOptions {
  fixCodeFenceLanguage?: boolean
}

interface GenerateResult {
  markdownOut: string
  jsonOut: StepIntoVisionPostMetaDocument
}

const KEYWORD_LIMIT = 8
const KEYWORD_WEIGHT_MARKDOWN = 2
const KEYWORD_WEIGHT_CATEGORY = 3
const KEYWORD_WEIGHT_TAG = 3
const KEYWORD_WEIGHT_REFERENCE = 2
const KEYWORD_WEIGHT_PROSE = 1

const TAG_TAXONOMY = new Set(["RealityKit", "SwiftUI", "visionOS"])

function uniqueBy<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>()
  const results: T[] = []
  for (const item of items) {
    const key = getKey(item)
    if (!key || seen.has(key)) {
      continue
    }
    seen.add(key)
    results.push(item)
  }
  return results
}

function canonicalizeUrl(value: string): string {
  try {
    const url = new URL(value)
    const params = url.searchParams
    const removals: string[] = []
    params.forEach((_val, key) => {
      if (key.startsWith("utm_") || key === "ref" || key === "login") {
        removals.push(key)
      }
    })
    for (const key of removals) {
      params.delete(key)
    }
    url.hash = url.hash
      .replace(/[#?]+secret=.*$/i, "")
      .replace(/[#?]+login=.*$/i, "")
    return url.toString()
  } catch (error) {
    return value
  }
}

function canonicalizeJson(value: unknown): string {
  const result = stringify(value)
  if (typeof result !== "string") {
    throw new Error("Failed to serialize value to JSON")
  }
  return result
}

function urlsEqual(a?: string | null, b?: string | null): boolean {
  if (!a || !b) {
    return false
  }
  return canonicalizeUrl(a) === canonicalizeUrl(b)
}

function buildKeywords(
  markdown: string,
  meta: StepIntoVisionPostMetaDocument,
  plainText?: string,
): string[] {
  const weights = new Map<string, number>()

  const addTokens = (tokens: string[], weight: number) => {
    for (const token of tokens) {
      if (!token) {
        continue
      }
      const lower = token.toLowerCase()
      weights.set(lower, (weights.get(lower) ?? 0) + weight)
    }
  }

  addTokens(extractKeywordCandidates(markdown), KEYWORD_WEIGHT_MARKDOWN)

  if (plainText) {
    addTokens(tokenizeKeywordText(plainText), KEYWORD_WEIGHT_PROSE)
  }

  for (const category of meta.categories ?? []) {
    addTokens(tokenizeKeywordText(category), KEYWORD_WEIGHT_CATEGORY)
  }

  for (const tag of meta.tags ?? []) {
    addTokens(tokenizeKeywordText(tag), KEYWORD_WEIGHT_TAG)
  }

  for (const reference of meta.references ?? []) {
    addTokens(tokenizeKeywordText(reference.title), KEYWORD_WEIGHT_REFERENCE)
  }

  addTokens(tokenizeKeywordText(meta.slug ?? ""), KEYWORD_WEIGHT_REFERENCE)

  const sorted = Array.from(weights.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1]
      }
      return a[0].localeCompare(b[0])
    })
    .map(([token]) => token)

  return uniqueBy(sorted, (token) => token).slice(0, KEYWORD_LIMIT)
}

function normalizeLinks(links: StepIntoVisionLink[] = []): StepIntoVisionLink[] {
  const normalized = links
    .map((link) => ({
      ...link,
      url: canonicalizeUrl(link.url),
      role: link.role as StepIntoVisionLinkRole,
    }))
    .filter((link) => Boolean(link.url && link.role))

  return uniqueBy(normalized, (link) => `${link.role}:${link.url}`)
}

function normalizeTags(tags: string[] = []): string[] {
  const normalized = tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => tag.replace(/\s+/g, " "))

  if (normalized.length === 0) {
    return []
  }

  const filtered = normalized.filter((tag) => TAG_TAXONOMY.has(tag))
  if (filtered.length > 0) {
    return uniqueBy(filtered, (tag) => tag)
  }

  return uniqueBy(normalized, (tag) => tag)
}

function normalizeReferences(meta: StepIntoVisionPostMetaDocument) {
  const references = (meta.references ?? []).map((reference) => ({
    ...reference,
    url: canonicalizeUrl(reference.url),
  }))

  const uniqueReferences = uniqueBy(references, (ref) => ref.url)

  const links = normalizeLinks(meta.links ?? [])
  const filteredLinks = uniqueBy(
    links.filter((link) => {
      return !uniqueReferences.some((reference) => reference.url === link.url)
    }),
    (link) => `${link.role}:${link.url}`,
  )

  return { references: uniqueReferences, links: filteredLinks }
}

function normalizeLicense(
  license?: StepIntoVisionLicense | StepIntoVisionLicenseType | string,
): StepIntoVisionLicense {
  const fallback: StepIntoVisionLicense = { type: "AllRightsReserved" }
  if (!license) {
    return fallback
  }

  const normalizeType = (value: string): StepIntoVisionLicenseType | null => {
    const lower = value.trim().toLowerCase()
    switch (lower) {
      case "allrightsreserved":
      case "all rights reserved":
        return "AllRightsReserved"
      case "cc-by-4.0":
      case "cc by 4.0":
        return "CC-BY-4.0"
      case "cc0":
        return "CC0"
      case "mit":
        return "MIT"
      case "apache-2.0":
      case "apache 2.0":
        return "Apache-2.0"
      default:
        return null
    }
  }

  if (typeof license === "string") {
    const normalized = normalizeType(license)
    return normalized ? { type: normalized } : fallback
  }

  const normalized = normalizeType(license.type)
  const type = normalized ?? fallback.type
  return {
    type,
    ...(license.url ? { url: canonicalizeUrl(license.url) } : {}),
  }
}

function buildContentDigest(
  base: Omit<StepIntoVisionPostMetaDocument, "contentDigest">,
): string {
  const canonical = canonicalizeJson(base)
  const digest = createHash("sha256").update(canonical, "utf8").digest("hex")
  return `sha256-${digest}`
}

export function generatePostArtifacts(
  markdown: string,
  json: StepIntoVisionPostMetaDocument,
  options: GeneratePostOptions = {},
): GenerateResult {
  const { fixCodeFenceLanguage = true } = options

  const fenced = fixCodeFenceLanguage
    ? ensureCodeFenceLanguages(markdown, { fixCodeFenceLanguage: true })
    : markdown

  const markdownOut = canonicalizeMarkdown(fenced)
  const analysis = analyzeMarkdown(markdownOut)
  const wordCount = analysis.wordCount
  const readingTimeSeconds = Math.max(0, Math.ceil((wordCount / 200) * 60))

  const codeBlocks = analysis.code.blocks.map((block) => ({
    ...block,
    id: `${block.lang}-${block.digest.replace("sha256-", "").slice(0, 8)}`,
  }))

  const code = {
    policy: "verbatim" as const,
    blocks: codeBlocks,
  }

  const normalized =
    typeof json.normalized === "boolean" ? json.normalized : json.normalizedScope === "prose"
  const normalizedScope =
    json.normalizedScope ?? (normalized ? "prose" : "none")
  const verbatim = json.verbatim ?? true

  const mcpResource =
    json.mcpResource ?? json.markdownUri ?? `stepintovision://post/${json.slug}`
  const markdownUri = json.markdownUri ?? mcpResource

  const videoUrl = json.videoUrl ? canonicalizeUrl(json.videoUrl) : undefined

  const { references, links } = normalizeReferences({
    ...json,
    links: json.links,
    references: json.references,
  })

  let filteredLinks = videoUrl
    ? links.filter((link) => !(link.role === "video" && urlsEqual(link.url, videoUrl)))
    : links

  if (videoUrl && !filteredLinks.some((link) => link.role === "video" && urlsEqual(link.url, videoUrl))) {
    filteredLinks = [
      ...filteredLinks,
      {
        role: "video" as StepIntoVisionLinkRole,
        url: videoUrl,
        title: "Video demo",
        sourceType: "thirdParty",
        rel: "supporting",
      },
    ]
  }

  const categories = uniqueBy(
    (json.categories ?? []).map((category) => category.trim()).filter(Boolean),
    (value) => value,
  )
  const tags = normalizeTags(json.tags ?? [])

  const author = typeof json.author === "string" ? { name: json.author } : json.author
  const normalizedAuthor = author?.name ? { ...author, name: author.name.trim() } : { name: "Unknown" }

  const license = normalizeLicense(json.license ?? "AllRightsReserved")

  const keywords = buildKeywords(
    markdownOut,
    {
      ...json,
      categories,
      tags,
      references,
    },
    analysis.text,
  )

  const baseMeta: Omit<StepIntoVisionPostMetaDocument, "contentDigest"> = {
    schema: "mcp.post.v1",
    id: json.id,
    slug: json.slug,
    title: json.title,
    description: json.description,
    summary: json.summary,
    locale: json.locale,
    canonicalUrl: canonicalizeUrl(json.canonicalUrl),
    markdownUri,
    mcpResource,
    publishedAt: json.publishedAt,
    updatedAt: json.updatedAt,
    categories,
    tags,
    author: normalizedAuthor,
    license,
    contentType: "text/markdown",
    wordCount,
    readingTimeSeconds,
    normalized,
    verbatim,
    ...(normalizedScope ? { normalizedScope } : {}),
    code,
    media: json.media ?? [],
    seeAlso: json.seeAlso ?? [],
    references,
    links: filteredLinks,
    ...(videoUrl ? { videoUrl } : {}),
    ...(json.assetSourceUrl
      ? { assetSourceUrl: canonicalizeUrl(json.assetSourceUrl) }
      : {}),
    ...(json.assetAuthor ? { assetAuthor: json.assetAuthor } : {}),
    ...(json.assetLicense ? { assetLicense: json.assetLicense } : {}),
    ...(json.status ? { status: json.status } : {}),
    ...(keywords.length > 0 ? { keywords } : {}),
    version: json.version ?? 1,
  }

  const contentDigest = buildContentDigest(baseMeta)

  const jsonOut: StepIntoVisionPostMetaDocument = {
    ...baseMeta,
    contentDigest,
  }

  return { markdownOut, jsonOut }
}

export type { GenerateResult }
