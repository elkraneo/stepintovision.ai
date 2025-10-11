export type StepIntoVisionMediaRole = "hero" | "illustration" | "video"

export interface StepIntoVisionMedia {
  role: StepIntoVisionMediaRole
  url: string
  alt: string
  width?: number | null
  height?: number | null
}

export type StepIntoVisionReferenceRole = "docs" | "article" | "video" | "discussion"

export interface StepIntoVisionSeeAlsoItem {
  title: string
  url: string
  role?: StepIntoVisionReferenceRole
}

export type StepIntoVisionLinkRole =
  | "download"
  | "repo"
  | "docs"
  | "video"
  | "asset"
  | "series"
  | "discussion"

export interface StepIntoVisionStatusAppliesTo {
  product: string
  versions?: string[]
}

export type StepIntoVisionStatusType =
  | "limitation"
  | "advisory"
  | "deprecation"
  | "availability"

export type StepIntoVisionStatusStability =
  | "likely_to_change"
  | "unlikely_to_change"
  | "unknown"

export interface StepIntoVisionStatus {
  type: StepIntoVisionStatusType
  stability?: StepIntoVisionStatusStability
  appliesTo?: StepIntoVisionStatusAppliesTo
  asOf?: string
  note?: string
}

export interface StepIntoVisionLink {
  role: StepIntoVisionLinkRole
  url: string
  title?: string
}

export type StepIntoVisionCodePolicy = "verbatim" | "verbatim+normalized-sidecar"

export interface StepIntoVisionCodeBlock {
  id: string
  lang: string
  startLine: number
  endLine: number
  digest: string
  normalizedUri?: string
}

export interface StepIntoVisionCodeMetadata {
  policy: StepIntoVisionCodePolicy
  blocks: StepIntoVisionCodeBlock[]
}

export type StepIntoVisionNormalizationScope = "prose" | "verbatim" | "sidecar" | "unknown"

export interface StepIntoVisionPost {
  id: number
  slug: string
  title: string
  excerpt: string
  contentHtml: string
  contentMarkdown: string
  contentText: string
  wordCount: number
  tokenCount: number
  readingTimeSeconds: number
  publishedAt: string
  updatedAt: string
  link: string
  categories: string[]
  tags: string[]
  heroImage?: StepIntoVisionMedia | null
  locale: string
  author: string
  license: string
  version: number
  normalized: boolean
  verbatim: boolean
  normalizedScope?: StepIntoVisionNormalizationScope
  seeAlso: StepIntoVisionSeeAlsoItem[]
  references: StepIntoVisionSeeAlsoItem[]
  links: StepIntoVisionLink[]
  contentDigest: string
  media: StepIntoVisionMedia[]
  videoUrl?: string | null
  assetSourceUrl?: string | null
  assetAuthor?: string | null
  assetLicense?: string | null
  code: StepIntoVisionCodeMetadata
  status?: StepIntoVisionStatus | null
}

export interface StepIntoVisionPostMetaDocument {
  schema: "mcp.post.v1"
  id: string
  slug: string
  title: string
  description: string
  summary: string
  locale: string
  canonicalUrl: string
  markdownUri: string
  publishedAt: string
  updatedAt: string
  categories: string[]
  tags: string[]
  author: {
    name: string
    url?: string
  }
  license: {
    type: string
    url?: string
  }
  contentType: "text/markdown"
  wordCount: number
  tokenCount: number
  readingTimeSeconds: number
  normalized: boolean
  verbatim: boolean
  normalizedScope?: StepIntoVisionNormalizationScope
  code: StepIntoVisionCodeMetadata
  media: StepIntoVisionMedia[]
  seeAlso: StepIntoVisionSeeAlsoItem[]
  references: StepIntoVisionSeeAlsoItem[]
  links: StepIntoVisionLink[]
  videoUrl?: string
  assetSourceUrl?: string
  assetAuthor?: string
  assetLicense?: string
  keywords?: string[]
  status?: StepIntoVisionStatus
  version: number
  contentDigest: string
}

export interface CatalogMetadata {
  source: string
  generatedAt: string
  itemCount: number
}

export interface CatalogFile {
  metadata: CatalogMetadata
  posts: StepIntoVisionPost[]
}

export interface SearchHit {
  id: number
  slug: string
  title: string
  excerpt: string
  publishedAt: string
  link: string
  score: number
}
