import { createHash } from "node:crypto"

import {
  analyzeMarkdown,
  canonicalizeMarkdown,
  ensureCodeFenceLanguages,
  extractKeywordCandidates,
  tokenizeKeywordText,
} from "./markdown-utils"
import type {
  StepIntoVisionLink,
  StepIntoVisionLinkRole,
  StepIntoVisionLicenseType,
  StepIntoVisionPostMetaDocument,
} from "./types"

export interface GeneratePostOptions {
  fixCodeFenceLanguage?: boolean
}

interface GenerateResult {
  markdownOut: string
  jsonOut: StepIntoVisionPostMetaDocument
}

const KEYWORD_LIMIT = 12
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

function buildContentDigest(markdown: string): string {
  const canonical = canonicalizeMarkdown(markdown)
  const digest = createHash("sha256").update(canonical, "utf8").digest("hex")
  return `sha256-${digest}`
}

export function generatePostArtifacts(
  markdown: string,
  json: StepIntoVisionPostMetaDocument,
  options: GeneratePostOptions = {},
): GenerateResult {
  const { fixCodeFenceLanguage = true } = options

  const markdownOut = fixCodeFenceLanguage
    ? ensureCodeFenceLanguages(markdown, { fixCodeFenceLanguage: true })
    : markdown

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

  const normalized = false
  const normalizedScope = "none" as const

  const mcpResource =
    json.mcpResource ?? json.markdownUri ?? `stepintovision://post/${json.slug}`
  const markdownUri = json.markdownUri ?? mcpResource

  const videoUrl = json.videoUrl ? canonicalizeUrl(json.videoUrl) : undefined

  const { references, links } = normalizeReferences({
    ...json,
    links: json.links,
    references: json.references,
  })

  const filteredLinks = videoUrl
    ? links.filter((link) => !(link.role === "video" && urlsEqual(link.url, videoUrl)))
    : links

  const categories = uniqueBy((json.categories ?? []).map((category) => category.trim()).filter(Boolean), (value) => value)
  const tags = normalizeTags(json.tags ?? [])

  const baseMeta: StepIntoVisionPostMetaDocument = {
    ...json,
    schema: "mcp.post.v1",
    mcpResource,
    markdownUri,
    canonicalUrl: canonicalizeUrl(json.canonicalUrl),
    author: typeof json.author === "string" ? { name: json.author } : json.author,
    license:
      typeof json.license === "string"
        ? { type: json.license as StepIntoVisionLicenseType }
        : json.license,
    wordCount,
    readingTimeSeconds,
    tokenCount: json.tokenCount ?? 0,
    normalized,
    normalizedScope,
    verbatim: json.verbatim ?? true,
    code,
    categories,
    tags,
    references,
    links: filteredLinks,
    version: json.version ?? 1,
    keywords: buildKeywords(markdownOut, {
      ...json,
      categories,
      tags,
      references,
    }, analysis.text),
  }

  const contentDigest = buildContentDigest(markdownOut)

  const jsonOut: StepIntoVisionPostMetaDocument = {
    ...baseMeta,
    contentDigest,
    ...(videoUrl ? { videoUrl } : {}),
  }

  return { markdownOut, jsonOut }
}

export type { GenerateResult }
