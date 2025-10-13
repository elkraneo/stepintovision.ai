#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { generatePostArtifacts } from "../lib/post-generator"
import type { StepIntoVisionPostMetaDocument } from "../lib/types"

interface CliOptions {
  markdownOutPath?: string
  jsonOutPath?: string
  fixCodeFenceLanguage: boolean
}

function parseArgs(argv: string[]): {
  mdPath: string
  jsonPath: string
  options: CliOptions
} {
  if (argv.length < 2) {
    throw new Error("Usage: mcp-post-gen <markdownPath> <jsonPath> [--markdown-out <path>] [--json-out <path>] [--no-fence-fix]")
  }

  const [mdPath, jsonPath, ...rest] = argv
  const options: CliOptions = {
    fixCodeFenceLanguage: true,
  }

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]
    if (arg === "--markdown-out") {
      options.markdownOutPath = rest[index + 1]
      index += 1
      continue
    }
    if (arg === "--json-out") {
      options.jsonOutPath = rest[index + 1]
      index += 1
      continue
    }
    if (arg === "--no-fence-fix") {
      options.fixCodeFenceLanguage = false
      continue
    }
  }

  return { mdPath, jsonPath, options }
}

async function writeMarkdown(output: string, pathOrStdout?: string) {
  if (pathOrStdout) {
    const resolved = path.resolve(pathOrStdout)
    await writeFile(resolved, output, "utf8")
    return
  }
  process.stdout.write(output)
  if (!output.endsWith("\n")) {
    process.stdout.write("\n")
  }
}

async function writeJson(output: StepIntoVisionPostMetaDocument, pathOrStdout?: string) {
  const serialized = `${JSON.stringify(output, null, 2)}\n`
  if (pathOrStdout) {
    const resolved = path.resolve(pathOrStdout)
    await writeFile(resolved, serialized, "utf8")
    return
  }
  process.stderr.write(serialized)
}

async function main() {
  try {
    const { mdPath, jsonPath, options } = parseArgs(process.argv.slice(2))
    const markdown = await readFile(mdPath, "utf8")
    const jsonRaw = await readFile(jsonPath, "utf8")
    const parsed = JSON.parse(jsonRaw) as StepIntoVisionPostMetaDocument

    const result = generatePostArtifacts(markdown, parsed, {
      fixCodeFenceLanguage: options.fixCodeFenceLanguage,
    })

    await writeMarkdown(result.markdownOut, options.markdownOutPath)
    await writeJson(result.jsonOut, options.jsonOutPath)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}

void main()
