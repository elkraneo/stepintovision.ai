import { createApp, type StepIntoVisionBindings } from "./app"
import { createJsonCatalogLoader } from "./lib/catalog-loader/json"
import type { StepIntoVisionPost } from "./lib/types"
import { fetchWordPressPosts } from "./lib/wordpress"

type WorkerEnv = StepIntoVisionBindings & {
  STEPINTOVISION_CATALOG_KV?: KVNamespace
}

const STEP_INTO_VISION_URL = "https://stepinto.vision"
const CATALOG_KV_KEY = "catalog.json"

let latestCatalogJson: string | undefined
let catalogLoadPromise: Promise<void> | undefined
let ingestPromise: Promise<void> | undefined
let initialIngestStarted = false

const catalogLoader = createJsonCatalogLoader(async () => latestCatalogJson)
const app = createApp({ loader: catalogLoader, isDev: false })

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
    await ensureCatalogLoaded(env)
    if (latestCatalogJson === undefined) {
      maybeRunInitialIngest(env, ctx)
    }

    return app.fetch(request, env, ctx)
  },
  async scheduled(event: ScheduledEvent, env: WorkerEnv, ctx: ExecutionContext) {
    await ensureCatalogLoaded(env)
    queueIngest(env, ctx, `scheduled (${event.cron})`)
  },
}

async function ensureCatalogLoaded(env: WorkerEnv) {
  if (latestCatalogJson !== undefined) {
    return
  }

  if (!catalogLoadPromise) {
    catalogLoadPromise = (async () => {
      const kvValue = await env.STEPINTOVISION_CATALOG_KV?.get(CATALOG_KV_KEY)
      if (kvValue) {
        latestCatalogJson = kvValue
        return
      }

      if (typeof env.STEPINTOVISION_CATALOG === "string") {
        latestCatalogJson = env.STEPINTOVISION_CATALOG
      }
    })().finally(() => {
      catalogLoadPromise = undefined
    })
  }

  await catalogLoadPromise
}

function maybeRunInitialIngest(env: WorkerEnv, ctx: ExecutionContext) {
  if (initialIngestStarted) {
    return
  }

  initialIngestStarted = true
  queueIngest(env, ctx, "initial deploy ingest").catch(() => {
    initialIngestStarted = false
  })
}

function queueIngest(env: WorkerEnv, ctx: ExecutionContext, reason: string) {
  const promise = runIngest(env, reason)
  ctx.waitUntil(promise)
  return promise
}

async function runIngest(env: WorkerEnv, reason: string) {
  if (!ingestPromise) {
    ingestPromise = (async () => {
      console.log(`Step Into Vision ingest started (${reason})`)
      try {
        const posts = await fetchWordPressPosts({ baseUrl: STEP_INTO_VISION_URL })
        const payload = buildCatalogPayload(posts)
        await persistCatalog(payload, env)
        console.log(`Step Into Vision ingest completed (${posts.length} posts)`)
      } catch (error) {
        console.error(`Step Into Vision ingest failed (${reason})`, error)
        throw error
      }
    })().finally(() => {
      ingestPromise = undefined
    })
  }

  await ingestPromise
}

function buildCatalogPayload(posts: StepIntoVisionPost[]): string {
  return JSON.stringify({
    metadata: {
      source: STEP_INTO_VISION_URL,
      generatedAt: new Date().toISOString(),
      itemCount: posts.length,
    },
    posts,
  })
}

async function persistCatalog(payload: string, env: WorkerEnv) {
  latestCatalogJson = payload

  const kv = env.STEPINTOVISION_CATALOG_KV
  if (kv) {
    try {
      await kv.put(CATALOG_KV_KEY, payload)
    } catch (error) {
      console.error("Failed to persist catalog to KV", error)
    }
  } else {
    console.warn("STEPINTOVISION_CATALOG_KV binding is not configured; catalog updates are in-memory only.")
  }
}
