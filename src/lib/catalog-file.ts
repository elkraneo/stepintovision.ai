import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"

import { createEmptyCatalog, parseCatalog } from "./catalog"
import type { CatalogFile, CatalogMetadata, StepIntoVisionPost } from "./types"

export const DEFAULT_CATALOG_PATH = "data/stepintovision.json"

export async function loadCatalog(filePath = DEFAULT_CATALOG_PATH): Promise<CatalogFile> {
  if (!existsSync(filePath)) {
    return createEmptyCatalog()
  }

  const raw = await readFile(filePath, "utf8")
  return parseCatalog(raw)
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
