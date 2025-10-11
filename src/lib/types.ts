export type StepIntoVisionMediaRole = "hero" | "illustration" | "video"

export interface StepIntoVisionMedia {
  role: StepIntoVisionMediaRole
  url: string
  alt: string
  width?: number | null
  height?: number | null
}

export interface StepIntoVisionSeeAlsoItem {
  title: string
  url: string
}

export type StepIntoVisionLinkRole =
  | "download"
  | "repo"
  | "docs"
  | "video"
  | "asset"
  | "series"

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
  code: StepIntoVisionCodeMetadata
  media: StepIntoVisionMedia[]
  seeAlso: StepIntoVisionSeeAlsoItem[]
  references: StepIntoVisionSeeAlsoItem[]
  links: StepIntoVisionLink[]
  videoUrl?: string
  assetSourceUrl?: string
  assetAuthor?: string
  assetLicense?: string
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
