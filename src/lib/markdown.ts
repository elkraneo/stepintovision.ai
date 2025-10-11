import type { StepIntoVisionPost } from "./types"

export function renderPostMarkdown(post: StepIntoVisionPost): string {
  const lines: string[] = []
  lines.push(`# ${post.title}`)

  const excerpt = post.excerpt.trim()
  if (excerpt) {
    lines.push("")
    lines.push(`> ${excerpt}`)
  }

  const body = post.contentMarkdown.trim()
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
