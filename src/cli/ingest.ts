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
    baseUrl: "https://stepintovision.ai",
    perPage: 50,
    maxPages: 10,
    output: DEFAULT_CATALOG_PATH,
    delayMs: 0,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith("--")) {
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

  return options
}

function printHelp() {
  console.log(`Step Into Vision ingestion

Usage: npm run ingest -- [options]

Options:
  --base-url <url>          Base WordPress site URL (default: https://stepintovision.ai)
  --per-page <number>       Number of posts per request (default: 50)
  --max-pages <number>      Maximum number of pages to fetch (default: 10)
  --modified-after <date>   Only fetch posts modified after ISO date
  --output <file>           Output catalog file (default: ${DEFAULT_CATALOG_PATH})
  --delay-ms <number>       Delay between requests in milliseconds (default: 0)
  --help                    Show this message
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
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}

await main()
