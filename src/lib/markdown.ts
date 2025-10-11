import YAML from "yaml"

import type { StepIntoVisionPost } from "./types"

function deriveCanonicalPath(link: string): string {
  try {
    const { pathname } = new URL(link)
    if (!pathname || pathname === "/") {
      return "/"
    }
    return pathname.replace(/\/+$/, "") || "/"
  } catch {
    return "/"
  }
}

export function renderPostMarkdown(post: StepIntoVisionPost): string {
  const publishedAtIso = new Date(post.publishedAt).toISOString()
  const updatedAtIso = new Date(post.updatedAt).toISOString()
  const wordCount = post.contentText.split(/\s+/).filter(Boolean).length
  const readingTimeSeconds = Math.max(30, Math.round((wordCount / 200) * 60))
  const readingTimeMinutes = Math.max(1, Math.round(readingTimeSeconds / 60))
  const tokenCount = Math.max(1, Math.round(wordCount * 1.3))
  const excerpt = post.excerpt.trim()

  const canonicalPath = deriveCanonicalPath(post.link)
  const frontMatterObject = {
    schema: "mcp.post.v1",
    id: String(post.id),
    slug: post.slug,
    title: post.title,
    description: excerpt,
    locale: post.locale,
    canonicalUrl: post.link,
    aiReadableUrl: `https://stepintovision.ai${canonicalPath}`,
    mcpResource: `stepintovision://post/${post.slug}`,
    publishedAt: publishedAtIso,
    updatedAt: updatedAtIso,
    author: post.author,
    license: post.license,
    version: post.version,
    contentType: "text/markdown",
    wordCount,
    tokenCount,
    readingTimeSeconds,
    categories: post.categories,
    tags: post.tags,
    heroImage: post.heroImage ?? null,
    seeAlso: post.seeAlso,
    contentDigest: post.contentDigest,
  }

  const frontMatterYaml = YAML.stringify(frontMatterObject).trimEnd()

  const humanPublished = new Date(post.publishedAt).toUTCString()
  const humanUpdated = new Date(post.updatedAt).toUTCString()

  const lines: string[] = []
  lines.push("---")
  lines.push(frontMatterYaml)
  lines.push("---")
  lines.push("")
  lines.push(`# ${post.title}`)
  lines.push("")
  if (excerpt) {
    lines.push(`> ${excerpt}`)
    lines.push("")
  }
  lines.push("## At a Glance")
  lines.push("")
  lines.push(`- **Canonical URL:** ${post.link}`)
  lines.push(`- **AI-readable URL:** https://stepintovision.ai${canonicalPath}`)
  lines.push(`- **Published:** ${humanPublished}`)
  if (humanUpdated !== humanPublished) {
    lines.push(`- **Updated:** ${humanUpdated}`)
  }
  lines.push(
    `- **Reading Time:** ${readingTimeMinutes} minute${readingTimeMinutes === 1 ? "" : "s"} (${wordCount} words, ~${readingTimeSeconds} seconds)`,
  )
  if (post.categories.length > 0) {
    lines.push(`- **Categories:** ${post.categories.join(", ")}`)
  }
  if (post.tags.length > 0) {
    lines.push(`- **Tags:** ${post.tags.join(", ")}`)
  }
  if (post.heroImage?.url) {
    const altText = post.heroImage.alt ? ` (alt: ${post.heroImage.alt})` : ""
    lines.push(`- **Hero Image:** ${post.heroImage.url}${altText}`)
  }
  lines.push(`- **MCP Resource:** stepintovision://post/${post.slug}`)
  lines.push(`- **Content Digest:** ${post.contentDigest}`)
  lines.push("")
  lines.push("## Body")
  lines.push("")
  lines.push(post.contentMarkdown)

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
