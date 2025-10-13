import { DOMParser as LinkedomDOMParser } from "linkedom"

function ensureDomParser() {
  if (typeof globalThis.DOMParser === "undefined") {
    globalThis.DOMParser = LinkedomDOMParser as unknown as typeof globalThis.DOMParser
  }
}

function ensureDocument() {
  if (typeof globalThis.document !== "undefined") {
    return
  }

  const parser = new LinkedomDOMParser()
  const { document } = parser.parseFromString("<!doctype html><html><head></head><body></body></html>", "text/html")

  // linkedom returns a window-like object, so extract the document reference.
  globalThis.document = document as unknown as Document
}

export function ensureDomEnvironment() {
  ensureDomParser()
  ensureDocument()
}

ensureDomEnvironment()
