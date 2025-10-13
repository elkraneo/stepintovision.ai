import { DOMParser as LinkedomDOMParser, parseHTML } from "linkedom"

type MutableGlobal = typeof globalThis & Record<string, unknown>

const globalScope = globalThis as MutableGlobal

function ensureDomParser() {
  if (typeof globalScope.DOMParser === "undefined") {
    globalScope.DOMParser = LinkedomDOMParser as unknown as typeof globalScope.DOMParser
  }
}

function ensureWindowAndDocument() {
  if (typeof globalScope.window !== "undefined" && typeof globalScope.document !== "undefined") {
    return
  }

  const { window, document } = parseHTML("<!doctype html><html><head></head><body></body></html>")

  globalScope.window = window as unknown as Window
  globalScope.document = document as unknown as Document
  if (typeof globalScope.self === "undefined") {
    globalScope.self = window as unknown as typeof globalScope.self
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

  for (const name of constructorNames) {
    if (typeof globalScope[name] === "undefined" && typeof (window as Record<string, unknown>)[name] !== "undefined") {
      globalScope[name] = (window as Record<string, unknown>)[name]
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
