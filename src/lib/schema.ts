import Ajv, { type DefinedError } from "ajv"
import addFormats from "ajv-formats"
import type { StepIntoVisionPostMetaDocument } from "./types"

const META_SCHEMA = {
  $id: "https://stepintovision.ai/schemas/mcp.post.v1.json",
  type: "object",
  additionalProperties: false,
  required: [
    "schema",
    "id",
    "slug",
    "title",
    "description",
    "summary",
    "locale",
    "canonicalUrl",
    "markdownUri",
    "publishedAt",
    "updatedAt",
    "categories",
    "tags",
    "author",
    "license",
    "contentType",
    "wordCount",
    "tokenCount",
    "readingTimeSeconds",
    "normalized",
    "verbatim",
    "code",
    "media",
    "seeAlso",
    "references",
    "links",
    "version",
    "contentDigest",
  ],
  properties: {
    schema: { const: "mcp.post.v1" },
    id: { type: "string", minLength: 1 },
    slug: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    summary: { type: "string", minLength: 1 },
    locale: { type: "string", minLength: 2 },
    canonicalUrl: { type: "string", format: "uri" },
    markdownUri: { type: "string", minLength: 1 },
    publishedAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
    categories: {
      type: "array",
      items: { type: "string" },
    },
    tags: {
      type: "array",
      items: { type: "string" },
    },
    author: {
      type: "object",
      required: ["name"],
      additionalProperties: false,
      properties: {
        name: { type: "string", minLength: 1 },
        url: { type: "string", format: "uri" },
      },
    },
    license: {
      type: "object",
      required: ["type"],
      additionalProperties: false,
      properties: {
        type: {
          type: "string",
          enum: ["AllRightsReserved", "CC-BY-4.0", "CC0", "MIT", "Apache-2.0"],
        },
        url: { type: "string", format: "uri" },
      },
    },
    contentType: { const: "text/markdown" },
    wordCount: { type: "integer", minimum: 0 },
    tokenCount: { type: "integer", minimum: 0 },
    readingTimeSeconds: { type: "integer", minimum: 0 },
    normalized: { type: "boolean" },
    verbatim: { type: "boolean" },
    normalizedScope: { type: "string", enum: ["prose", "none"] },
    code: {
      type: "object",
      required: ["policy", "blocks"],
      additionalProperties: false,
      properties: {
        policy: { const: "verbatim" },
        blocks: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "lang", "startLine", "endLine", "digest"],
            additionalProperties: false,
            properties: {
              id: { type: "string", minLength: 1 },
              lang: { type: "string", minLength: 1 },
              startLine: { type: "integer", minimum: 1 },
              endLine: { type: "integer", minimum: 1 },
              digest: { type: "string", pattern: "^sha256-[a-f0-9]{64}$" },
              normalizedUri: { type: "string", format: "uri" },
            },
          },
        },
      },
    },
    media: {
      type: "array",
      items: {
        type: "object",
        required: ["role", "url", "alt"],
        additionalProperties: false,
        properties: {
          role: { type: "string", enum: ["hero", "illustration", "video"] },
          url: { type: "string", format: "uri" },
          alt: { type: "string", minLength: 1 },
          width: { type: "integer", minimum: 0 },
          height: { type: "integer", minimum: 0 },
        },
      },
    },
    seeAlso: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "url"],
        additionalProperties: false,
        properties: {
          title: { type: "string", minLength: 1 },
          url: { type: "string", format: "uri" },
          role: { type: "string", enum: ["docs", "article", "video", "discussion"] },
          sourceType: { type: "string", enum: ["firstParty", "thirdParty"] },
          rel: { type: "string", enum: ["canonical", "supporting"] },
        },
      },
    },
    references: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "url"],
        additionalProperties: false,
        properties: {
          title: { type: "string", minLength: 1 },
          url: { type: "string", format: "uri" },
          role: { type: "string", enum: ["docs", "article", "video", "discussion"] },
          sourceType: { type: "string", enum: ["firstParty", "thirdParty"] },
          rel: { type: "string", enum: ["canonical", "supporting"] },
        },
      },
    },
    links: {
      type: "array",
      items: {
        type: "object",
        required: ["role", "url"],
        additionalProperties: false,
        properties: {
          role: {
            type: "string",
            enum: ["download", "repo", "docs", "video", "asset", "series", "discussion"],
          },
          url: { type: "string", format: "uri" },
          title: { type: "string" },
          sourceType: { type: "string", enum: ["firstParty", "thirdParty"] },
          rel: { type: "string", enum: ["canonical", "supporting"] },
        },
      },
    },
    videoUrl: { type: "string", format: "uri" },
    assetSourceUrl: { type: "string", format: "uri" },
    assetAuthor: { type: "string" },
    assetLicense: { type: "string" },
    keywords: {
      type: "array",
      items: { type: "string" },
      maxItems: 12,
    },
    status: {
      type: "object",
      additionalProperties: false,
      required: ["type"],
      properties: {
        type: {
          type: "string",
          enum: ["limitation", "advisory", "deprecation", "availability"],
        },
        stability: {
          type: "string",
          enum: ["likely_to_change", "unlikely_to_change", "unknown"],
        },
        appliesTo: {
          type: "object",
          additionalProperties: false,
          required: ["product"],
          properties: {
            product: { type: "string" },
            versions: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
        asOf: { type: "string", format: "date-time" },
        note: { type: "string" },
      },
    },
    version: { type: "integer", minimum: 1 },
    contentDigest: { type: "string", pattern: "^sha256-[a-f0-9]{64}$" },
  },
}

const ajv = new Ajv({ allErrors: true, strict: true })
addFormats(ajv)

const validateMetaDocument = ajv.compile<StepIntoVisionPostMetaDocument>(META_SCHEMA)

export function assertValidMetaDocument(meta: StepIntoVisionPostMetaDocument): void {
  if (validateMetaDocument(meta)) {
    return
  }

  const errors = (validateMetaDocument.errors ?? []) as DefinedError[]
  const message = errors
    .map((error) => {
      const path = error.instancePath || "<root>"
      return `${path} ${error.message ?? "is invalid"}`
    })
    .join("; ")

  throw new Error(`Invalid mcp.post.v1 document: ${message}`)
}

export const metaDocumentSchema = META_SCHEMA as const
