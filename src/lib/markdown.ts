import type { StepIntoVisionPost } from "./types"

export function renderPostMarkdown(post: StepIntoVisionPost): string {
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

  return lines.join("\n")
}

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase()
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
