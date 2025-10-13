import { createApp, type StepIntoVisionBindings } from "./app"
import { createJsonCatalogLoader } from "./lib/catalog-loader/json"

let latestCatalogJson: string | undefined

const catalogLoader = createJsonCatalogLoader(async () => latestCatalogJson)
const app = createApp({ loader: catalogLoader, isDev: false })

export default {
  async fetch(request: Request, env: StepIntoVisionBindings, ctx: ExecutionContext) {
    if (typeof env.STEPINTOVISION_CATALOG === "string") {
      latestCatalogJson = env.STEPINTOVISION_CATALOG
    }

    return app.fetch(request, env, ctx)
  },
}
