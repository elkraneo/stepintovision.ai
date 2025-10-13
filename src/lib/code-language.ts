export function inferCodeLanguage(code: string): string | null {
  const trimmed = code.trim()
  if (!trimmed) {
    return null
  }

  if (/\bimport\s+(SwiftUI|RealityKit|RealityKitContent)/.test(trimmed)) {
    return "swift"
  }
  if (/\bstruct\s+[A-Z]/.test(trimmed) && trimmed.includes(": View")) {
    return "swift"
  }
  if (/^\s*(extension|xtension)\s+[A-Z]/m.test(trimmed)) {
    return "swift"
  }
  if (/\bfunc\s+[a-zA-Z0-9_]+\s*\(/.test(trimmed)) {
    return "swift"
  }
  if (/class\s+[A-Z]/.test(trimmed) && trimmed.includes("NSObject")) {
    return "swift"
  }
  if (/^\s*(var|let)\s+[A-Za-z0-9_]+\s*:\s*[A-Z]/m.test(trimmed)) {
    return "swift"
  }

  const swiftMarkers = [
    "spatialOverlay",
    "glassBackgroundDisplayMode",
    "glassBackgroundBox",
    "Edge3D.",
    "rotation3DLayout",
    "ModelViewSimple",
    "ModelView",
    "Model3D",
    "RealityView",
    "RealityViewContent",
    "GeometryReader3D",
    "GeometryProxy3D",
  ]

  if (swiftMarkers.some((marker) => trimmed.includes(marker))) {
    return "swift"
  }

  if (/^\s*@(?:MainActor|State|Binding|Environment)/m.test(trimmed)) {
    return "swift"
  }

  return null
}
