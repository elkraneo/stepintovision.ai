#!/usr/bin/env node

import { DEFAULT_CATALOG_PATH, saveCatalog } from "../lib/catalog"
import type { StepIntoVisionPost } from "../lib/types"
import { fetchWordPressPosts } from "../lib/wordpress"

const STEP_INTO_VISION_URL = "https://stepinto.vision"

interface CliOptions {
  output: string
  maxPages: number
  modifiedAfter?: string
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    output: DEFAULT_CATALOG_PATH,
    maxPages: 10,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]

    if (arg === "--") {
      continue
    }

    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${arg}`)
    }

    const next = argv[i + 1]
    switch (arg) {
      case "--output":
        if (!next) throw new Error("--output requires a file path")
        options.output = next
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
  --output <file>           Output catalog file (default: ${DEFAULT_CATALOG_PATH})
  --max-pages <number>      Maximum number of pages to fetch (default: 10)
  --modified-after <date>   Only fetch posts modified after ISO date
  --help                    Show this message
`)
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2))
    console.log(`Fetching posts from ${STEP_INTO_VISION_URL}`)
    const posts: StepIntoVisionPost[] = await fetchWordPressPosts({
      baseUrl: STEP_INTO_VISION_URL,
      maxPages: options.maxPages,
      modifiedAfter: options.modifiedAfter,
    })

    console.log(`Fetched ${posts.length} posts. Writing catalog to ${options.output}`)
    await saveCatalog(posts, options.output, { source: STEP_INTO_VISION_URL })
    console.log("Catalog written successfully.")
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message)
      const cause = (error as { cause?: unknown }).cause
      if (cause instanceof Error && cause.message) {
        console.error(`Caused by: ${cause.message}`)
      }
    } else {
      console.error(error)
    }
    process.exitCode = 1
  }
}

await main()
