/**
 * Registre global des ArrayBuffer de fonts custom chargées dans la session
 * (IDML uploads, fonts projet Firebase Storage). Utilisé par la capture SVG
 * vidéo pour embed les fonts en `data:` URL dans le SVG — sinon le browser
 * headless de Cloud Run n'a pas accès aux FontFace runtime de la session et
 * fallback sur Arial/Times.
 */

export interface FontBufferEntry {
  family: string
  weight: string
  style: string
  buffer: ArrayBuffer
  mimeType: string
}

const registry = new Map<string, FontBufferEntry[]>()

function mimeFromFilename(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop() ?? ''
  switch (ext) {
    case 'woff2': return 'font/woff2'
    case 'woff': return 'font/woff'
    case 'ttf': return 'font/ttf'
    case 'otf': return 'font/otf'
    case 'eot': return 'application/vnd.ms-fontobject'
    default: return 'application/octet-stream'
  }
}

export function registerFontBuffer(
  family: string,
  weight: string,
  style: string,
  buffer: ArrayBuffer,
  fileName: string,
): void {
  if (!family || !buffer) return
  const entry: FontBufferEntry = {
    family,
    weight: weight || '400',
    style: style || 'normal',
    buffer,
    mimeType: mimeFromFilename(fileName),
  }
  const arr = registry.get(family)
  if (arr) {
    // Évite les doublons (même family/weight/style).
    const existing = arr.find((e) => e.weight === entry.weight && e.style === entry.style)
    if (existing) return
    arr.push(entry)
  } else {
    registry.set(family, [entry])
  }
}

export function lookupFontBuffers(family: string): FontBufferEntry[] {
  return registry.get(family) ?? []
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  // Chunked conversion pour éviter call stack overflow sur gros buffers (>100KB).
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/**
 * Construit un bloc CSS `@font-face` pour les `families` demandées, avec
 * `src: url(data:font/...;base64,...)`. Renvoie '' si aucune famille trouvée.
 */
export function buildFontFaceCss(families: Iterable<string>): string {
  const blocks: string[] = []
  for (const family of families) {
    const entries = lookupFontBuffers(family)
    for (const e of entries) {
      const base64 = bufferToBase64(e.buffer)
      const format = e.mimeType === 'font/woff2' ? 'woff2'
        : e.mimeType === 'font/woff' ? 'woff'
        : e.mimeType === 'font/ttf' ? 'truetype'
        : e.mimeType === 'font/otf' ? 'opentype'
        : 'truetype'
      blocks.push(
        `@font-face{font-family:'${e.family.replace(/'/g, "\\'")}';font-weight:${e.weight};font-style:${e.style};src:url(data:${e.mimeType};base64,${base64}) format('${format}');}`
      )
    }
  }
  return blocks.join('\n')
}
