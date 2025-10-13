import type { CatalogFile, StepIntoVisionPost } from "../types"

type CatalogChangeListener = () => void

export type CatalogLoader = (() => Promise<StepIntoVisionPost[]>) & {
  subscribe(listener: CatalogChangeListener): () => void
  loadCatalog(): Promise<CatalogFile>
}

export type { CatalogChangeListener }
