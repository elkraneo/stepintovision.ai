import type { StepIntoVisionPost } from "./types"

function quoteYamlString(value: string): string {
  return JSON.stringify(value)
}

function formatYamlArray(key: string, values: string[]): string[] {
  if (values.length === 0) {
    return [`${key}: []`]
  }

  const lines = [`${key}:`]
  for (const value of values) {
    lines.push(`  - ${quoteYamlString(value)}`)
  }
  return lines
}

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
  const readingTimeMinutes = Math.max(1, Math.round(wordCount / 200))
  const excerpt = post.excerpt.trim()

  const canonicalPath = deriveCanonicalPath(post.link)
  const frontMatter: string[] = [
    "---",
    `title: ${quoteYamlString(post.title)}`,
    `description: ${quoteYamlString(excerpt)}`,
    `slug: ${quoteYamlString(post.slug)}`,
    `id: ${post.id}`,
    `source: ${quoteYamlString(post.link)}`,
    `timestamp: ${quoteYamlString(updatedAtIso)}`,
    `publishedAt: ${quoteYamlString(publishedAtIso)}`,
    `updatedAt: ${quoteYamlString(updatedAtIso)}`,
    `wordCount: ${wordCount}`,
    `readingTimeMinutes: ${readingTimeMinutes}`,
    `mcpResource: ${quoteYamlString(`stepintovision://post/${post.slug}`)}`,
    `aiReadableUrl: ${quoteYamlString(`https://stepintovision.ai${canonicalPath}`)}`,
    `heroImage: ${post.heroImage ? quoteYamlString(post.heroImage) : "null"}`,
    ...formatYamlArray("categories", post.categories),
    ...formatYamlArray("tags", post.tags),
    "---",
  ]

  const humanPublished = new Date(post.publishedAt).toUTCString()
  const humanUpdated = new Date(post.updatedAt).toUTCString()

  const lines: string[] = []
  lines.push(...frontMatter)
  lines.push("")
  lines.push(`# ${post.title}`)
  lines.push("")
  if (excerpt) {
    lines.push(`> ${excerpt}`)
    lines.push("")
  }
  lines.push("## At a Glance")
  lines.push("")
  lines.push(`- **Source:** ${post.link}`)
  lines.push(`- **Published:** ${humanPublished}`)
  if (humanUpdated !== humanPublished) {
    lines.push(`- **Updated:** ${humanUpdated}`)
  }
  lines.push(`- **Reading Time:** ${readingTimeMinutes} minute${readingTimeMinutes === 1 ? "" : "s"} (${wordCount} words)`)
  if (post.categories.length > 0) {
    lines.push(`- **Categories:** ${post.categories.join(", ")}`)
  }
  if (post.tags.length > 0) {
    lines.push(`- **Tags:** ${post.tags.join(", ")}`)
  }
  if (post.heroImage) {
    lines.push(`- **Hero Image:** ${post.heroImage}`)
  }
  lines.push("- **MCP Resource:** stepintovision://post/" + post.slug)
  lines.push("")
  lines.push("---")
  lines.push("")
  lines.push(post.contentText)
  lines.push("")
  lines.push("---")
  lines.push("")
  lines.push("## Original HTML")
  lines.push("")
  lines.push("```html")
  lines.push(post.contentHtml)
  lines.push("```")

  return lines.join("\n")
}
