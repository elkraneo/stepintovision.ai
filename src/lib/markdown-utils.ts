import { createHash } from "node:crypto"

import type {
  StepIntoVisionCodeBlock,
  StepIntoVisionCodeMetadata,
} from "./types"

export function canonicalizeMarkdown(value: string): string {
  const normalizedLineEndings = value.replace(/\r\n/g, "\n")
  const trimmedLines = normalizedLineEndings
    .split("\n")
    .map((line) => line.replace(/\s+$/u, ""))
  let canonical = trimmedLines.join("\n").trim()
  if (!canonical.endsWith("\n")) {
    canonical += "\n"
  }
  return canonical
}

export function extractCodeMetadata(markdown: string): StepIntoVisionCodeMetadata {
  const lines = markdown.split("\n")
  const blocks: StepIntoVisionCodeBlock[] = []
  let inside = false
  let info = ""
  let startLine = 0
  let buffer: string[] = []

  const pushBlock = (endLine: number) => {
    const lang = info.split(/\s+/)[0] || "text"
    const codeText = buffer.join("\n")
    const digest = createHash("sha256").update(codeText, "utf8").digest("hex")
    blocks.push({
      id: `code-${blocks.length + 1}`,
      lang,
      startLine,
      endLine,
      digest: `sha256-${digest}`,
    })
  }

  lines.forEach((line, index) => {
    const lineNumber = index + 1
    if (!inside) {
      const match = line.match(/^```(.*)$/)
      if (match) {
        inside = true
        info = match[1]?.trim() ?? ""
        startLine = lineNumber
        buffer = []
      }
      return
    }

    if (line.startsWith("```")) {
      pushBlock(lineNumber)
      inside = false
      info = ""
      buffer = []
      startLine = 0
      return
    }

    buffer.push(line)
  })

  return {
    policy: "verbatim",
    blocks,
  }
}
