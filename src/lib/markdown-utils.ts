import { createHash } from "node:crypto"

import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkStringify from "remark-stringify"
import remarkGfm from "remark-gfm"
import { visit, SKIP } from "unist-util-visit"
import { toString } from "mdast-util-to-string"
import type { Code, Parent, Root } from "mdast"

import type {
  StepIntoVisionCodeBlock,
  StepIntoVisionCodeMetadata,
} from "./types"
import { inferCodeLanguage } from "./code-language"

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "have",
  "into",
  "using",
  "will",
  "your",
  "about",
  "when",
  "how",
  "were",
  "while",
  "their",
  "there",
  "also",
  "they",
  "them",
  "then",
  "than",
  "just",
  "each",
  "make",
  "made",
  "more",
  "some",
  "such",
  "only",
  "very",
  "over",
  "onto",
  "into",
  "through",
  "first",
  "move",
])

const KEYWORD_SHORT_ALLOW = new Set(["3d", "ar", "vr", "ai", "usd", "usdz", "usdc", "usda"])

const PROSE_PARENT_TYPES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "listItem",
  "tableCell",
  "table",
  "emphasis",
  "strong",
  "delete",
  "link",
])

function createParser() {
  return unified().use(remarkParse).use(remarkGfm)
}

function createStringifier() {
  return unified().use(remarkGfm).use(remarkStringify, {
    bullet: "-",
    fences: true,
    listItemIndent: "one",
  })
}

function isProseParent(parent?: Parent | null): boolean {
  if (!parent) {
    return false
  }
  if (parent.type === "definition" || parent.type === "footnoteDefinition") {
    return false
  }
  if (PROSE_PARENT_TYPES.has(parent.type)) {
    return true
  }
  return false
}

export function canonicalizeMarkdown(value: string): string {
  const normalizedLineEndings = value.replace(/\r\n/g, "\n")
  const lines = normalizedLineEndings.split("\n")

  const result: string[] = []
  let insideCode = false

  for (const line of lines) {
    const isFence = line.startsWith("```")
    if (!insideCode) {
      result.push(line.replace(/\s+$/u, ""))
    } else {
      result.push(line)
    }
    if (isFence) {
      insideCode = !insideCode
    }
  }

  while (result.length > 0 && result[0].trim() === "") {
    result.shift()
  }
  while (result.length > 0 && result[result.length - 1].trim() === "") {
    result.pop()
  }

  let canonical = result.join("\n")
  if (!canonical.endsWith("\n")) {
    canonical += "\n"
  }
  return canonical
}

export function ensureCodeFenceLanguages(markdown: string): string {
  const lines = markdown.split("\n")
  const result = [...lines]

  let inside = false
  let fenceIndex = -1
  let info = ""
  let buffer: string[] = []

  const updateFence = () => {
    if (fenceIndex < 0) {
      return
    }

    const codeText = buffer.join("\n")
    const detected = inferCodeLanguage(codeText)
    if (!detected) {
      return
    }

    const trimmedInfo = info.trim()
    const infoParts = trimmedInfo ? trimmedInfo.split(/\s+/) : []
    const currentLang = infoParts[0] ?? ""
    const remainder = trimmedInfo.slice(currentLang.length).trim()

    if (currentLang && currentLang !== "text" && currentLang !== "plain") {
      return
    }

    const newInfo = remainder ? `${detected} ${remainder}` : detected
    const original = result[fenceIndex]
    const trimmed = original.trimStart()
    const indent = original.slice(0, original.length - trimmed.length)
    result[fenceIndex] = indent + "```" + newInfo
  }

  lines.forEach((line, index) => {
    const trimmed = line.trimStart()
    if (trimmed.startsWith("```") && !inside) {
      inside = true
      fenceIndex = index
      info = trimmed.slice(3)
      buffer = []
      return
    }

    if (trimmed.startsWith("```") && inside) {
      updateFence()
      inside = false
      fenceIndex = -1
      info = ""
      buffer = []
      return
    }

    if (inside) {
      buffer.push(trimmed)
    }
  })

  let canonical = result.join("\n")
  if (!canonical.endsWith("\n")) {
    canonical += "\n"
  }
  return canonical
}

export interface NormalizedMarkdownResult {
  markdown: string
  changed: boolean
}

export function normalizeMarkdownProse(
  markdown: string,
  transform: (value: string) => string,
): NormalizedMarkdownResult {
  const parser = createParser()
  const tree = parser.parse(markdown) as Root
  let changed = false

  visit(tree, "text", (node, _index, parent) => {
    if (!isProseParent(parent)) {
      return
    }
    const next = transform(node.value)
    if (next !== node.value) {
      node.value = next
      changed = true
    }
  })

  const stringifier = createStringifier()
  const rendered = stringifier.stringify(tree) as string
  return {
    markdown: canonicalizeMarkdown(rendered),
    changed,
  }
}

function extractCodeMetadataFromTree(root: Root): StepIntoVisionCodeMetadata {
  const blocks: StepIntoVisionCodeBlock[] = []

  visit(root, "code", (node: Code) => {
    if (!node.position) {
      return
    }
    const lang = (node.lang ?? "text").toLowerCase() || "text"
    const digest = createHash("sha256").update(node.value, "utf8").digest("hex")
    const idBase = lang.replace(/[^a-z0-9]+/g, "-") || "code"
    blocks.push({
      id: `${idBase}-${digest.slice(0, 8)}`,
      lang,
      startLine: node.position.start.line,
      endLine: node.position.end.line,
      digest: `sha256-${digest}`,
    })
  })

  return { policy: "verbatim", blocks }
}

function collectPlainText(root: Root): string {
  const blocks: string[] = []

  visit(root, (node) => {
    switch (node.type) {
      case "heading":
      case "paragraph":
      case "blockquote": {
        const value = toString(node).trim()
        if (value) {
          blocks.push(value)
        }
        return SKIP
      }
      case "list": {
        for (const child of node.children) {
          const value = toString(child).trim()
          if (value) {
            blocks.push(value)
          }
        }
        return SKIP
      }
      default:
        return
    }
  })

  return blocks.join("\n\n")
}

function countProseWords(root: Root): number {
  let count = 0
  visit(root, "text", (node, _index, parent) => {
    if (!isProseParent(parent)) {
      return
    }
    const tokens = node.value
      .trim()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean)
    count += tokens.length
  })
  return count
}

export interface MarkdownAnalysis {
  code: StepIntoVisionCodeMetadata
  wordCount: number
  text: string
}

export function analyzeMarkdown(markdown: string): MarkdownAnalysis {
  const parser = createParser()
  const tree = parser.parse(markdown) as Root
  return {
    code: extractCodeMetadataFromTree(tree),
    wordCount: countProseWords(tree),
    text: collectPlainText(tree),
  }
}

export function extractKeywordCandidates(markdown: string): string[] {
  const parser = createParser()
  const tree = parser.parse(markdown) as Root
  const tokens: string[] = []

  visit(tree, (node) => {
    switch (node.type) {
      case "heading":
      case "emphasis":
      case "strong":
      case "link": {
        const value = toString(node)
        tokens.push(...tokenizeKeywordText(value))
        return node.type === "heading" ? SKIP : undefined
      }
      default:
        return
    }
  })

  return tokens
}

export function tokenizeKeywordText(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[`*_~]/g, " ")
    .replace(/[^a-z0-9+.#-]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .filter((token) => token.length >= 3 || KEYWORD_SHORT_ALLOW.has(token))
    .filter((token) => !STOPWORDS.has(token))
}
