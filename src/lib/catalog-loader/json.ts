import { createEmptyCatalog, parseCatalog } from "../catalog"
import type { CatalogLoader } from "./types"
import { computePostsSignature } from "./utils"

export type CatalogJsonProvider = () => Promise<string | undefined> | string | undefined

function ensurePromise(value: CatalogJsonProvider): () => Promise<string | undefined> {
  if (typeof value === "function") {
    return async () => {
      const result = value()
      return typeof result === "string" || result === undefined ? result : await result
    }
  }
  return async () => (typeof value === "string" ? value : undefined)
}

export function createJsonCatalogLoader(provider: CatalogJsonProvider): CatalogLoader {
  const resolveProvider = ensurePromise(provider)
  let cachedPosts: Awaited<ReturnType<CatalogLoader>> | undefined
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

  const parsePosts = (json: string | undefined) => {
    if (!json) {
      return createEmptyCatalog()
    }
    try {
      return parseCatalog(json)
    } catch (error) {
      console.error("Failed to parse catalog JSON", error)
      return createEmptyCatalog()
    }
  }

  const loadPosts = (async function loadPosts() {
    const json = await resolveProvider()
    const catalog = parsePosts(json)
    const posts = catalog.posts
    const signature = computePostsSignature(posts)
    if (!cachedPosts || signature !== lastSignature) {
      cachedPosts = posts
      lastSignature = signature
      notifyChange()
    }
    return cachedPosts ?? []
  }) as CatalogLoader

  loadPosts.subscribe = (listener) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  loadPosts.loadCatalog = async () => {
    const json = await resolveProvider()
    const catalog = parsePosts(json)
    cachedPosts = catalog.posts
    lastSignature = computePostsSignature(catalog.posts)
    return catalog
  }

  return loadPosts
}
