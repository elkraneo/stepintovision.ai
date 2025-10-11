import { stat } from "node:fs/promises"
import { existsSync } from "node:fs"

import { loadCatalog } from "./catalog"
import type { StepIntoVisionPost } from "./types"

export function createCatalogLoader(filePath: string) {
  let cachedPosts: StepIntoVisionPost[] | undefined
  let lastLoadedAt = 0

  return async function loadPosts(): Promise<StepIntoVisionPost[]> {
    if (!existsSync(filePath)) {
      cachedPosts = []
      lastLoadedAt = Date.now()
      return cachedPosts
    }

    const fileStats = await stat(filePath)
    if (!cachedPosts || fileStats.mtimeMs > lastLoadedAt) {
      const catalog = await loadCatalog(filePath)
      cachedPosts = catalog.posts
      lastLoadedAt = fileStats.mtimeMs
    }

    return cachedPosts
  }
}
