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
