export type StepIntoVisionMediaRole = "hero" | "illustration" | "video"

export type StepIntoVisionSourceType = "firstParty" | "thirdParty"

export type StepIntoVisionLinkRel = "canonical" | "supporting"

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
  sourceType?: StepIntoVisionSourceType
  rel?: StepIntoVisionLinkRel
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
  sourceType?: StepIntoVisionSourceType
  rel?: StepIntoVisionLinkRel
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

export type StepIntoVisionNormalizationScope = "prose" | "none"

export type StepIntoVisionLicenseType =
  | "AllRightsReserved"
  | "CC-BY-4.0"
  | "CC0"
  | "MIT"
  | "Apache-2.0"

export interface StepIntoVisionLicense {
  type: StepIntoVisionLicenseType
  url?: string
}

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
  license: StepIntoVisionLicenseType
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
  keywords?: string[]
  warnings?: string[]
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
  license: StepIntoVisionLicense
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
