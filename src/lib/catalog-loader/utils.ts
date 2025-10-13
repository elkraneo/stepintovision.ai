import type { StepIntoVisionPost } from "../types"

export function computePostsSignature(posts: StepIntoVisionPost[]): string {
  return posts
    .map((post) => `${post.id}:${post.updatedAt}:${post.version}`)
    .join("|")
}
