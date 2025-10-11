#!/usr/bin/env node

import { readFile } from "node:fs/promises"

import { DEFAULT_CATALOG_PATH, saveCatalog } from "../lib/catalog"
import type { StepIntoVisionPost } from "../lib/types"
import { postsFromWordPressJson } from "../lib/wordpress-file"
import { fetchWordPressPosts } from "../lib/wordpress"

interface CliOptions {
  baseUrl: string
  perPage: number
  maxPages: number
  modifiedAfter?: string
  output: string
  delayMs: number
  source: "wordpress" | "file"
  input?: string
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    baseUrl: process.env.STEPINTOVISION_BASE_URL ?? "https://stepinto.vision",
    perPage: 50,
    maxPages: 10,
    output: DEFAULT_CATALOG_PATH,
    delayMs: 0,
    source: "wordpress",
  }

  const positional: string[] = []

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]

    if (arg === "--") {
      continue
    }

    if (!arg.startsWith("--")) {
      positional.push(arg)
      continue
    }

    const next = argv[i + 1]
    switch (arg) {
      case "--base-url":
        if (!next) throw new Error("--base-url requires a value")
        options.baseUrl = next
        i += 1
        break
      case "--per-page":
        if (!next) throw new Error("--per-page requires a value")
        options.perPage = Number.parseInt(next, 10)
        if (Number.isNaN(options.perPage) || options.perPage <= 0) {
          throw new Error("--per-page must be a positive integer")
        }
        i += 1
        break
      case "--max-pages":
        if (!next) throw new Error("--max-pages requires a value")
        options.maxPages = Number.parseInt(next, 10)
        if (Number.isNaN(options.maxPages) || options.maxPages <= 0) {
          throw new Error("--max-pages must be a positive integer")
        }
        i += 1
        break
      case "--modified-after":
        if (!next) throw new Error("--modified-after requires an ISO date string")
        options.modifiedAfter = next
        i += 1
        break
      case "--output":
        if (!next) throw new Error("--output requires a file path")
        options.output = next
        i += 1
        break
      case "--delay-ms":
        if (!next) throw new Error("--delay-ms requires a value")
        options.delayMs = Number.parseInt(next, 10)
        if (Number.isNaN(options.delayMs) || options.delayMs < 0) {
          throw new Error("--delay-ms must be a non-negative integer")
        }
        i += 1
        break
      case "--source":
        if (!next) throw new Error("--source requires a value")
        if (next !== "wordpress" && next !== "file") {
          throw new Error("--source must be either 'wordpress' or 'file'")
        }
        options.source = next
        i += 1
        break
      case "--input":
        if (!next) throw new Error("--input requires a value")
        options.input = next
        i += 1
        break
      case "--help":
        printHelp()
        process.exit(0)
        break
      default:
        throw new Error(`Unknown option: ${arg}`)
    }
  }

  if (positional.length > 0) {
    if (options.source === "file") {
      options.input = positional[0]
    } else {
      options.baseUrl = positional[0]
    }
    if (positional.length > 1) {
      throw new Error(`Unexpected positional arguments: ${positional.slice(1).join(", ")}`)
    }
  }

  if (options.source === "file" && !options.input) {
    throw new Error("--input is required when --source is 'file'")
  }

  return options
}

function printHelp() {
  const defaultBaseUrl = process.env.STEPINTOVISION_BASE_URL ?? "https://stepinto.vision"
  console.log(`Step Into Vision ingestion

Usage: npm run ingest -- [options] [base-url]

Options:
  --base-url <url>          Base WordPress site URL (default: ${defaultBaseUrl})
  --per-page <number>       Number of posts per request (default: 50)
  --max-pages <number>      Maximum number of pages to fetch (default: 10)
  --modified-after <date>   Only fetch posts modified after ISO date
  --output <file>           Output catalog file (default: ${DEFAULT_CATALOG_PATH})
  --delay-ms <number>       Delay between requests in milliseconds (default: 0)
  --source <wordpress|file> Fetch from live WordPress or a saved JSON export
  --input <file|->          File path or '-' for stdin when --source=file
  --help                    Show this message

Positional arguments:
  base-url                  Equivalent to --base-url when --source=wordpress
  input                     Equivalent to --input when --source=file
`)
}

async function main() {
  let mode: "wordpress" | "file" = "wordpress"
  try {
    const options = parseArgs(process.argv.slice(2))
    mode = options.source
    let posts: StepIntoVisionPost[]
    let sourceLabel: string

    if (options.source === "file") {
      const input = options.input ?? "-"
      sourceLabel = input === "-" ? "stdin" : input
      console.log(`Reading posts from ${sourceLabel}`)
      posts = await loadPostsFromInput(input)
    } else {
      console.log(`Fetching posts from ${options.baseUrl}`)
      posts = await fetchWordPressPosts({
        baseUrl: options.baseUrl,
        perPage: options.perPage,
        maxPages: options.maxPages,
        modifiedAfter: options.modifiedAfter,
        delayMs: options.delayMs,
      })
      sourceLabel = options.baseUrl
    }

    console.log(`Fetched ${posts.length} posts. Writing catalog to ${options.output}`)
    await saveCatalog(posts, options.output, { source: sourceLabel })
    console.log("Catalog written successfully.")
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message)
      const cause = (error as { cause?: unknown }).cause
      if (cause instanceof Error && cause.message) {
        console.error(`Caused by: ${cause.message}`)
      }
      if (mode === "wordpress") {
        console.error(
          "Set STEPINTOVISION_BASE_URL or pass --base-url to target an accessible WordPress instance.",
        )
        console.error(
          "When direct network access is unavailable, use --source=file with a saved WordPress JSON export.",
        )
      }
    } else {
      console.error(error)
    }
    process.exitCode = 1
  }
}

async function loadPostsFromInput(input: string): Promise<StepIntoVisionPost[]> {
  const payload = input === "-" ? await readStdin() : await readFile(input, "utf-8")

  let data: unknown
  try {
    data = JSON.parse(payload)
  } catch (error) {
    throw new Error("Failed to parse WordPress JSON export", {
      cause: error instanceof Error ? error : undefined,
    })
  }

  return postsFromWordPressJson(data)
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new Error("No data provided on stdin. Pass a file path or pipe JSON input.")
  }

  const chunks: string[] = []
  return new Promise((resolve, reject) => {
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", (chunk) => {
      chunks.push(chunk)
    })
    process.stdin.on("error", (error) => {
      reject(error)
    })
    process.stdin.on("end", () => {
      resolve(chunks.join(""))
    })
  })
}

await main()
