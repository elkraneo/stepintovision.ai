import type { StepIntoVisionPost } from "./types"

export function renderPostMarkdown(post: StepIntoVisionPost): string {
  const lines: string[] = []
  lines.push(`# ${post.title}`)
  lines.push(`Source: ${post.link}`)
  lines.push(`Published: ${new Date(post.publishedAt).toISOString()}`)
  if (post.updatedAt && post.updatedAt !== post.publishedAt) {
    lines.push(`Updated: ${new Date(post.updatedAt).toISOString()}`)
  }
  if (post.heroImage) {
    lines.push(`![Hero image](${post.heroImage})`)
  }
  if (post.categories.length > 0) {
    lines.push(`Categories: ${post.categories.join(", ")}`)
  }
  if (post.tags.length > 0) {
    lines.push(`Tags: ${post.tags.join(", ")}`)
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
