#!/usr/bin/env node

import { DEFAULT_CATALOG_PATH, saveCatalog } from "../lib/catalog"
import { fetchWordPressPosts } from "../lib/wordpress"

interface CliOptions {
  baseUrl: string
  perPage: number
  maxPages: number
  modifiedAfter?: string
  output: string
  delayMs: number
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    baseUrl: process.env.STEPINTOVISION_BASE_URL ?? "https://stepintovision.ai",
    perPage: 50,
    maxPages: 10,
    output: DEFAULT_CATALOG_PATH,
    delayMs: 0,
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
      case "--help":
        printHelp()
        process.exit(0)
        break
      default:
        throw new Error(`Unknown option: ${arg}`)
    }
  }

  if (positional.length > 0) {
    options.baseUrl = positional[0]
    if (positional.length > 1) {
      throw new Error(`Unexpected positional arguments: ${positional.slice(1).join(", ")}`)
    }
  }

  return options
}

function printHelp() {
  const defaultBaseUrl = process.env.STEPINTOVISION_BASE_URL ?? "https://stepintovision.ai"
  console.log(`Step Into Vision ingestion

Usage: npm run ingest -- [options] [base-url]

Options:
  --base-url <url>          Base WordPress site URL (default: ${defaultBaseUrl})
  --per-page <number>       Number of posts per request (default: 50)
  --max-pages <number>      Maximum number of pages to fetch (default: 10)
  --modified-after <date>   Only fetch posts modified after ISO date
  --output <file>           Output catalog file (default: ${DEFAULT_CATALOG_PATH})
  --delay-ms <number>       Delay between requests in milliseconds (default: 0)
  --help                    Show this message

Positional arguments:
  base-url                  Equivalent to --base-url for npm run ingest users
`)
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2))
    console.log(`Fetching posts from ${options.baseUrl}`)

    const posts = await fetchWordPressPosts({
      baseUrl: options.baseUrl,
      perPage: options.perPage,
      maxPages: options.maxPages,
      modifiedAfter: options.modifiedAfter,
      delayMs: options.delayMs,
    })

    console.log(`Fetched ${posts.length} posts. Writing catalog to ${options.output}`)
    await saveCatalog(posts, options.output, { source: options.baseUrl })
    console.log("Catalog written successfully.")
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message)
      const cause = (error as { cause?: unknown }).cause
      if (cause instanceof Error && cause.message) {
        console.error(`Caused by: ${cause.message}`)
      }
      console.error(
        "Set STEPINTOVISION_BASE_URL or pass --base-url to target an accessible WordPress instance.",
      )
    } else {
      console.error(error)
    }
    process.exitCode = 1
  }
}

await main()
