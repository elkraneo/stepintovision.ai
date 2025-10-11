export interface StepIntoVisionMedia {
  role: "hero"
  url: string
  alt?: string | null
  width?: number | null
  height?: number | null
}

export interface StepIntoVisionSeeAlsoItem {
  title: string
  url: string
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
  seeAlso: StepIntoVisionSeeAlsoItem[]
  contentDigest: string
}

export interface StepIntoVisionPostMetaDocument {
  schema: "mcp.post.v1"
  id: string
  slug: string
  title: string
  description: string
  locale: string
  canonicalUrl: string
  markdownUri: string
  mcpResource: string
  publishedAt: string
  updatedAt: string
  categories: string[]
  tags: string[]
  author: string
  license: string
  version: number
  contentType: "text/markdown"
  wordCount: number
  tokenCount: number
  readingTimeSeconds: number
  heroImage?: StepIntoVisionMedia | null
  media: StepIntoVisionMedia[]
  seeAlso: StepIntoVisionSeeAlsoItem[]
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
