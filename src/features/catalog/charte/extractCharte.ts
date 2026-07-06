// src/features/catalog/charte/extractCharte.ts
// Extraction AUTOMATIQUE d'une charte graphique depuis des éléments joints
// (PDF de charte, logo, visuels de marque) : palette dominante par quantification
// de pixels + noms de polices lus dans le PDF. Tout devient de la DONNÉE
// (CatalogCharte) : persistée avec le catalogue, appliquée au thème et injectée
// dans le prompt du plan IA (moteur créatif).
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { CatalogCharte } from '../catalogTypes'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export const EMPTY_CHARTE: CatalogCharte = { files: [], colors: [], fonts: [], notes: '' }

/** Quantifie les pixels d'un canvas (4 bits/canal) → hex dominants dédupliqués. */
function paletteFromCanvas(canvas: HTMLCanvasElement, max = 8): string[] {
  const ctx = canvas.getContext('2d')
  if (!ctx) return []
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue // transparent
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const bk = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    bk.n++; bk.r += r; bk.g += g; bk.b += b
    buckets.set(key, bk)
  }
  const toHex = (v: number) => Math.round(v).toString(16).padStart(2, '0')
  const all = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .map((bk) => ({ n: bk.n, r: bk.r / bk.n, g: bk.g / bk.n, b: bk.b / bk.n }))
  // Dédup PERCEPTUELLE (distance RGB) — sinon la palette est 6 nuances du même beige.
  const kept: typeof all = []
  for (const c of all) {
    if (kept.length >= max) break
    if (kept.some((k) => (k.r - c.r) ** 2 + (k.g - c.g) ** 2 + (k.b - c.b) ** 2 < 48 ** 2)) continue
    kept.push(c)
  }
  return kept.map((c) => `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`)
}

async function canvasFromImage(file: File): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 128 / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bmp.width * scale))
  canvas.height = Math.max(1, Math.round(bmp.height * scale))
  canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return canvas
}

/** Nettoie un nom de police PDF : `ABCDEF+BarlowCondensed-Bold` → `BarlowCondensed`. */
function cleanFontName(raw: string): string | null {
  const name = raw.replace(/^[A-Z]{6}\+/, '').split(/[-,]/)[0].trim()
  if (!name || /^(g_d\d|Type\d|Helvetica$|Arial$|Times)/i.test(name)) return name || null
  return name
}

async function extractFromPdf(file: File): Promise<{ colors: string[]; fonts: string[] }> {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  const fonts = new Set<string>()
  const colors: string[] = []
  const pages = Math.min(pdf.numPages, 3)
  for (let p = 1; p <= pages; p++) {
    const page = await pdf.getPage(p)
    // Rendu basse résolution → palette (les couleurs de la charte sont surfaciques).
    const viewport = page.getViewport({ scale: 128 / Math.max(page.view[2], page.view[3]) })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(viewport.width))
    canvas.height = Math.max(1, Math.round(viewport.height))
    const ctx = canvas.getContext('2d')
    if (ctx) {
      await page.render({ canvasContext: ctx, viewport, canvas }).promise
      colors.push(...paletteFromCanvas(canvas))
    }
    // Polices : les objets fonte sont chargés par le rendu → commonObjs.
    const tc = await page.getTextContent()
    for (const id of new Set(tc.items.flatMap((it) => ('fontName' in it ? [it.fontName] : [])))) {
      try {
        const f = page.commonObjs.get(id) as { name?: string } | null
        const cleaned = f?.name ? cleanFontName(f.name) : null
        if (cleaned) fonts.add(cleaned)
      } catch { /* fonte non chargée (page sans rendu) : ignorée */ }
    }
  }
  // Re-dédup multi-pages en préservant l'ordre de dominance.
  const seen = new Set<string>()
  return { colors: colors.filter((c) => !seen.has(c) && seen.add(c)).slice(0, 8), fonts: [...fonts].slice(0, 6) }
}

/** Extrait palette (+ typos pour les PDF) d'UN fichier joint et FUSIONNE dans la charte. */
export async function extractCharteFromFile(file: File, base: CatalogCharte): Promise<CatalogCharte> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  const { colors, fonts } = isPdf
    ? await extractFromPdf(file)
    : { colors: paletteFromCanvas(await canvasFromImage(file)), fonts: [] as string[] }
  const mergedColors = [...base.colors, ...colors.filter((c) => !base.colors.includes(c))].slice(0, 10)
  const mergedFonts = [...base.fonts, ...fonts.filter((f) => !base.fonts.includes(f))].slice(0, 8)
  return { ...base, files: [...base.files, file.name].slice(-6), colors: mergedColors, fonts: mergedFonts }
}

/** Luminance + saturation simples pour la répartition heuristique dans le thème. */
const rgb = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)] as const
const lum = (hex: string) => { const [r, g, b] = rgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 }
const sat = (hex: string) => { const [r, g, b] = rgb(hex); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx }

/**
 * Répartit la palette extraite dans le thème du catalogue (heuristique retail) :
 * accent = le plus SATURÉ · fond = le plus CLAIR · encre = le plus SOMBRE ·
 * bandeau = 2e teinte marquée · texte bandeau = fond (contraste).
 */
export function charteToThemePatch(charte: CatalogCharte): { accent?: string; pageBg?: string; ink?: string; headerBg?: string; headerInk?: string } {
  const c = charte.colors
  if (!c.length) return {}
  const accent = [...c].sort((a, b) => sat(b) * (1 - Math.abs(lum(b) - 0.5)) - sat(a) * (1 - Math.abs(lum(a) - 0.5)))[0]
  const pageBg = [...c].sort((a, b) => lum(b) - lum(a))[0]
  const ink = [...c].sort((a, b) => lum(a) - lum(b))[0]
  const headerBg = [...c].filter((x) => x !== accent && x !== pageBg)
    .sort((a, b) => sat(b) - sat(a))[0] ?? accent
  return {
    accent,
    ...(lum(pageBg) > 0.75 ? { pageBg } : {}),
    ...(lum(ink) < 0.35 ? { ink } : {}),
    headerBg,
    headerInk: lum(headerBg) > 0.6 ? (lum(ink) < 0.35 ? ink : '#1a1a1a') : (lum(pageBg) > 0.75 ? pageBg : '#ffffff'),
  }
}
