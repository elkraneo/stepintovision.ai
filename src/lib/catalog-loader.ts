import { stat } from "node:fs/promises"
import { existsSync } from "node:fs"

import { loadCatalog } from "./catalog"
import type { StepIntoVisionPost } from "./types"

type CatalogChangeListener = () => void

export type CatalogLoader = (() => Promise<StepIntoVisionPost[]>) & {
  subscribe(listener: CatalogChangeListener): () => void
}

export function createCatalogLoader(filePath: string): CatalogLoader {
  let cachedPosts: StepIntoVisionPost[] | undefined
  let lastLoadedAt = 0
  let lastSignature: string | undefined
  const listeners = new Set<CatalogChangeListener>()

  const notifyChange = () => {
    for (const listener of listeners) {
      try {
        listener()
      } catch (error) {
        console.error("Catalog change listener failed", error)
      }
    }
  }

  const computeSignature = (posts: StepIntoVisionPost[]): string => {
    return posts
      .map((post) => `${post.id}:${post.updatedAt}:${post.version}`)
      .join("|")
  }

  const loadPosts = (async function loadPosts(): Promise<StepIntoVisionPost[]> {
    if (!existsSync(filePath)) {
      if (!cachedPosts) {
        cachedPosts = []
      }
      const signature = computeSignature(cachedPosts)
      if (signature !== lastSignature) {
        lastSignature = signature
        notifyChange()
      }
      return cachedPosts
    }

    const fileStats = await stat(filePath)
    if (!cachedPosts || fileStats.mtimeMs > lastLoadedAt) {
      const catalog = await loadCatalog(filePath)
      cachedPosts = catalog.posts
      lastLoadedAt = fileStats.mtimeMs
      const signature = computeSignature(cachedPosts)
      if (signature !== lastSignature) {
        lastSignature = signature
        notifyChange()
      }
    }

    return cachedPosts
  }) as CatalogLoader

  loadPosts.subscribe = (listener: CatalogChangeListener) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return loadPosts
}
