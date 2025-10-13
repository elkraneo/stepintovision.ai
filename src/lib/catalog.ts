import { readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import Fuse from "fuse.js"

import type { CatalogFile, CatalogMetadata, SearchHit, StepIntoVisionPost } from "./types"

export const DEFAULT_CATALOG_PATH = "data/stepintovision.json"

export async function loadCatalog(filePath = DEFAULT_CATALOG_PATH): Promise<CatalogFile> {
  if (!existsSync(filePath)) {
    return {
      metadata: {
        source: "https://stepinto.vision",
        generatedAt: new Date(0).toISOString(),
        itemCount: 0,
      },
      posts: [],
    }
  }

  const raw = await readFile(filePath, "utf8")
  const parsed = JSON.parse(raw) as CatalogFile
  return parsed
}

export async function saveCatalog(
  posts: StepIntoVisionPost[],
  filePath = DEFAULT_CATALOG_PATH,
  metadata: Partial<CatalogMetadata> = {},
): Promise<void> {
  const payload: CatalogFile = {
    metadata: {
      source: metadata.source ?? "https://stepinto.vision",
      generatedAt: metadata.generatedAt ?? new Date().toISOString(),
      itemCount: posts.length,
    },
    posts,
  }

  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8")
}

export function getPostBySlug(posts: StepIntoVisionPost[], slug: string): StepIntoVisionPost | undefined {
  return posts.find((post) => post.slug === slug)
}

export function getPostById(posts: StepIntoVisionPost[], id: number): StepIntoVisionPost | undefined {
  return posts.find((post) => post.id === id)
}

export interface ListOptions {
  limit?: number
  offset?: number
  category?: string
  tag?: string
}

export function listPosts(posts: StepIntoVisionPost[], options: ListOptions = {}): StepIntoVisionPost[] {
  const { limit = 10, offset = 0, category, tag } = options

  const filtered = posts
    .filter((post) => {
      if (category && !post.categories.includes(category)) {
        return false
      }
      if (tag && !post.tags.includes(tag)) {
        return false
      }
      return true
    })
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())

  return filtered.slice(offset, offset + limit)
}

let fuseInstance: Fuse<StepIntoVisionPost> | undefined
let fuseSourceKey = ""

export function ensureSearchIndex(posts: StepIntoVisionPost[]): Fuse<StepIntoVisionPost> {
  const serializedKey = posts.map((post) => `${post.id}:${post.updatedAt}`).join("|")
  if (!fuseInstance || fuseSourceKey !== serializedKey) {
    fuseInstance = new Fuse(posts, {
      includeScore: true,
      useExtendedSearch: true,
      shouldSort: true,
      keys: [
        { name: "title", weight: 0.4 },
        { name: "excerpt", weight: 0.2 },
        { name: "contentText", weight: 0.3 },
        { name: "tags", weight: 0.05 },
        { name: "categories", weight: 0.05 },
      ],
      threshold: 0.35,
      ignoreLocation: true,
    })
    fuseSourceKey = serializedKey
  }

  return fuseInstance
}

export function searchPosts(posts: StepIntoVisionPost[], query: string, limit = 10): SearchHit[] {
  if (!query.trim()) {
    return []
  }

  const fuse = ensureSearchIndex(posts)
  const results = fuse.search(query, { limit })

  return results.map(({ item, score }) => ({
    id: item.id,
    slug: item.slug,
    title: item.title,
    excerpt: item.excerpt,
    publishedAt: item.publishedAt,
    link: item.link,
    score: typeof score === "number" ? 1 - score : 0,
  }))
}
