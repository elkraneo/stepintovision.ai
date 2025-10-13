import { createApp, type StepIntoVisionBindings } from "./app"
import { DEFAULT_CATALOG_PATH } from "./lib/catalog-file"
import { createCatalogLoader } from "./lib/catalog-loader/file"

const isNode = typeof process !== "undefined" && typeof process.release?.name === "string"
const isDev = isNode ? process.env.NODE_ENV !== "production" || process.argv.includes("--dev") : false
const port = isNode ? Number.parseInt(process.env.PORT ?? "8787", 10) : 8787

const catalogLoader = createCatalogLoader(DEFAULT_CATALOG_PATH)
export const app = createApp({ loader: catalogLoader, isDev })

if (import.meta.main && isNode) {
  const { serve } = await import("@hono/node-server")
  serve({
    fetch: app.fetch,
    port,
  })
  console.log(`Step Into Vision server listening on http://localhost:${port}`)
}

export type { StepIntoVisionBindings }
export { createApp }
export default app
