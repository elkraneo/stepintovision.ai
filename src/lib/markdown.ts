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

export function renderPostMarkdown(post: StepIntoVisionPost): string {
  const publishedAt = new Date(post.publishedAt).toISOString()
  const updatedAt = new Date(post.updatedAt).toISOString()
  const wordCount = post.contentText.split(/\s+/).filter(Boolean).length
  const readingTimeMinutes = Math.max(1, Math.round(wordCount / 200))

  const frontMatter: string[] = [
    "---",
    `id: ${post.id}`,
    `slug: ${quoteYamlString(post.slug)}`,
    `title: ${quoteYamlString(post.title)}`,
    `url: ${quoteYamlString(post.link)}`,
    `publishedAt: ${quoteYamlString(publishedAt)}`,
    `updatedAt: ${quoteYamlString(updatedAt)}`,
    `excerpt: ${quoteYamlString(post.excerpt)}`,
    `heroImage: ${post.heroImage ? quoteYamlString(post.heroImage) : "null"}`,
    `wordCount: ${wordCount}`,
    `readingTimeMinutes: ${readingTimeMinutes}`,
    ...formatYamlArray("categories", post.categories),
    ...formatYamlArray("tags", post.tags),
    "---",
  ]

  const lines: string[] = []
  lines.push(...frontMatter)
  lines.push("")
  lines.push(`# ${post.title}`)
  lines.push("")
  lines.push(`Source: ${post.link}`)
  lines.push(`Published: ${publishedAt}`)
  if (updatedAt !== publishedAt) {
    lines.push(`Updated: ${updatedAt}`)
  }
  if (post.heroImage) {
    lines.push("")
    lines.push(`![Hero image](${post.heroImage})`)
  }
  if (post.categories.length > 0 || post.tags.length > 0) {
    lines.push("")
    if (post.categories.length > 0) {
      lines.push(`Categories: ${post.categories.join(", ")}`)
    }
    if (post.tags.length > 0) {
      lines.push(`Tags: ${post.tags.join(", ")}`)
    }
  }
  if (post.excerpt) {
    lines.push("")
    lines.push(`> ${post.excerpt}`)
  }
  lines.push("")
  lines.push(post.contentText)
  lines.push("")
  lines.push("---")
  lines.push("```html")
  lines.push(post.contentHtml)
  lines.push("```")

  return lines.join("\n")
}
