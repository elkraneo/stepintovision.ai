import { createHash } from "node:crypto"

import type {
  StepIntoVisionCodeMetadata,
  StepIntoVisionPost,
} from "./types"
import {
  analyzeMarkdown,
  canonicalizeMarkdown,
  ensureCodeFenceLanguages,
} from "./markdown-utils"

export interface RenderedPostMarkdown {
  markdown: string
  code: StepIntoVisionCodeMetadata
  contentDigest: string
}

export function buildRenderedPostMarkdown(post: StepIntoVisionPost): RenderedPostMarkdown {
  const lines: string[] = []
  lines.push(`# ${post.title}`)

  const excerpt = post.excerpt.trim()
  if (excerpt) {
    lines.push("")
    lines.push(`> ${excerpt}`)
  }

  const body = stripExcerptFromBody(post.contentMarkdown, excerpt)
  if (body) {
    lines.push("")
    lines.push(body)
  }

  if (post.seeAlso.length > 0) {
    lines.push("")
    lines.push("## See Also")
    lines.push("")
    for (const item of post.seeAlso) {
      lines.push(`- [${item.title}](${item.url})`)
    }
  }

  const raw = lines.join("\n")
  let markdown = canonicalizeMarkdown(raw)
  markdown = ensureCodeFenceLanguages(markdown)
  markdown = canonicalizeMarkdown(markdown)
  const analysis = analyzeMarkdown(markdown)
  const digest = createHash("sha256").update(markdown, "utf8").digest("hex")

  return {
    markdown,
    code: analysis.code,
    contentDigest: `sha256-${digest}`,
  }
}

export function renderPostMarkdown(post: StepIntoVisionPost): string {
  return buildRenderedPostMarkdown(post).markdown
}

function normalizeForComparison(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[`*_~]/g, "")
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase()
}

function stripExcerptFromBody(body: string, excerpt: string): string {
  const trimmedBody = body.trim()
  if (!trimmedBody || !excerpt.trim()) {
    return trimmedBody
  }

  const normalizedExcerpt = normalizeForComparison(excerpt)
  if (!normalizedExcerpt) {
    return trimmedBody
  }

  const firstParagraphMatch = trimmedBody.match(/^(.+?)(\n\s*\n|$)/s)
  const firstParagraph = firstParagraphMatch?.[1]?.trim() ?? ""
  if (!firstParagraph) {
    return trimmedBody
  }

  const normalizedParagraph = normalizeForComparison(firstParagraph)
  if (normalizedParagraph !== normalizedExcerpt) {
    return trimmedBody
  }

  const remainder = trimmedBody.slice(firstParagraphMatch![0].length)
  return remainder.replace(/^\s+/, "").trim()
}
