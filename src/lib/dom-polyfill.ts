import { DOMParser as LinkedomDOMParser, parseHTML } from "linkedom"

const globalScope = globalThis as Record<string, unknown>

function ensureDomParser() {
  if (typeof globalScope.DOMParser === "undefined") {
    globalScope.DOMParser = LinkedomDOMParser
  }
}

function ensureWindowAndDocument() {
  if (globalScope.window && globalScope.document) {
    return
  }

  const { window, document } = parseHTML("<!doctype html><html><head></head><body></body></html>")

  globalScope.window = window
  globalScope.document = document
  if (typeof globalScope.self === "undefined") {
    globalScope.self = window
  }

  ensureTableRowsSupport(window as unknown as Record<string, unknown>)

  const constructorNames = [
    "Document",
    "DocumentFragment",
    "Element",
    "HTMLElement",
    "HTMLDocument",
    "Node",
    "NodeList",
    "Text",
    "Comment",
    "NamedNodeMap",
    "Range",
  ]

  const windowRecord = window as unknown as Record<string, unknown>

  for (const name of constructorNames) {
    if (typeof globalScope[name] === "undefined" && typeof windowRecord[name] !== "undefined") {
      globalScope[name] = windowRecord[name]
    }
  }

  if (typeof globalScope.navigator === "undefined") {
    globalScope.navigator = { userAgent: "linkedom", platform: "workers" }
  }
}

export function ensureDomEnvironment() {
  ensureWindowAndDocument()
  ensureDomParser()
}

ensureDomEnvironment()

function ensureTableRowsSupport(window: Record<string, unknown>) {
  const HTMLElementConstructor = window.HTMLElement as Record<string, unknown> | undefined
  if (!HTMLElementConstructor) {
    return
  }

  const prototype = HTMLElementConstructor.prototype as Record<string, unknown> | undefined
  if (!prototype || typeof prototype !== "object") {
    return
  }

  const descriptor = Object.getOwnPropertyDescriptor(prototype, "rows")
  if (descriptor && typeof descriptor.get === "function") {
    return
  }

  Object.defineProperty(prototype, "rows", {
    get(this: Record<string, unknown>) {
      const element = this
      const tagName = typeof element.tagName === "string" ? element.tagName : undefined
      if (!tagName || tagName.toUpperCase() !== "TABLE") {
        return undefined
      }

      const getElementsByTagName = element.getElementsByTagName as ((tag: string) => unknown) | undefined
      if (typeof getElementsByTagName !== "function") {
        return undefined
      }

      return getElementsByTagName.call(element, "tr")
    },
    configurable: true,
    enumerable: false,
  })
}
