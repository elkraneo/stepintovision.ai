export interface StepIntoVisionPost {
  id: number
  slug: string
  title: string
  excerpt: string
  contentHtml: string
  contentText: string
  publishedAt: string
  updatedAt: string
  link: string
  categories: string[]
  tags: string[]
  heroImage?: string | null
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
