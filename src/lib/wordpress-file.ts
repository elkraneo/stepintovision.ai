import type { StepIntoVisionPost } from "./types"
import { normalizeWordPressPost } from "./wordpress"

export function postsFromWordPressJson(json: unknown): StepIntoVisionPost[] {
  if (!Array.isArray(json)) {
    throw new Error("Expected WordPress export to be a JSON array of posts")
  }

  return json.map((item, index) => {
    if (item === null || typeof item !== "object") {
      throw new Error(`Post at index ${index} is not a valid object`)
    }

    return normalizeWordPressPost(item as never)
  })
}
