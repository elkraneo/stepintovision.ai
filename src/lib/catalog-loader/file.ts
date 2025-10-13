import { stat } from "node:fs/promises"
import { existsSync } from "node:fs"

import { loadCatalog } from "../catalog-file"
import { createEmptyCatalog } from "../catalog"
import type { CatalogLoader } from "./types"
import { computePostsSignature } from "./utils"

export function createCatalogLoader(filePath: string): CatalogLoader {
  let cachedPosts: Awaited<ReturnType<CatalogLoader>> | undefined
  let lastLoadedAt = 0
  let lastSignature: string | undefined
  const listeners = new Set<Parameters<CatalogLoader["subscribe"]>[0]>()

  const notifyChange = () => {
    for (const listener of listeners) {
      try {
        listener()
      } catch (error) {
        console.error("Catalog change listener failed", error)
      }
    }
  }

  const loadPosts = (async function loadPosts() {
    if (!existsSync(filePath)) {
      if (!cachedPosts) {
        cachedPosts = []
      }
      const signature = computePostsSignature(cachedPosts)
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
      const signature = computePostsSignature(cachedPosts)
      if (signature !== lastSignature) {
        lastSignature = signature
        notifyChange()
      }
    }

    return cachedPosts
  }) as CatalogLoader

  loadPosts.subscribe = (listener) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  loadPosts.loadCatalog = async () => {
    if (!existsSync(filePath)) {
      if (!cachedPosts) {
        cachedPosts = []
      }
      return {
        ...createEmptyCatalog(),
        posts: cachedPosts,
      }
    }

    const catalog = await loadCatalog(filePath)
    cachedPosts = catalog.posts
    return catalog
  }

  return loadPosts
}
