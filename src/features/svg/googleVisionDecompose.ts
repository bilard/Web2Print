/**
 * Décomposition d'image via Google Cloud Vision API (DOCUMENT_TEXT_DETECTION).
 *
 * Pipeline minimal : appel HTTPS direct, parse `fullTextAnnotation.pages[0].blocks[].paragraphs[]`.
 * Retourne pour chaque paragraph la bbox englobante + les positions des WORDS individuels.
 * Les words servent au caller à détecter le multi-ligne (Vision merge parfois des lignes
 * visuelles distinctes en un seul paragraph → bbox = englobante de toutes les lignes).
 *
 * AUCUN filtrage ici (variance, confidence) — fait dans le hook caller pour rester
 * découplé et inspectable.
 *
 * Setup : `VITE_GOOGLE_VISION_API_KEY` dans `.env.local`, Cloud Vision API activée
 * sur le projet GCP. Tarif : ~$0.0015 par appel.
 */

const ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate'

export interface VisionWord {
  /** Texte concaténé des symboles du mot */
  text: string
  /** Bbox axis-aligned du mot, pixels absolus image source */
  bbox: { left: number; top: number; width: number; height: number }
}

export interface VisionParagraph {
  /** Texte concaténé de tous les words, séparés par des espaces */
  text: string
  /** Bbox englobante du paragraph */
  bbox: { left: number; top: number; width: number; height: number }
  /** Confiance Vision [0, 1] */
  confidence: number
  /** Words individuels — utiles pour détecter le multi-ligne en regroupant par y */
  words: VisionWord[]
}

export interface VisionDecomposeResult {
  imageWidth: number
  imageHeight: number
  paragraphs: VisionParagraph[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Types internes Vision API response
// ─────────────────────────────────────────────────────────────────────────────

interface RawVertex { x?: number; y?: number }
interface RawPoly { vertices?: RawVertex[] }
interface RawSymbol { text?: string }
interface RawWord { symbols?: RawSymbol[]; boundingBox?: RawPoly; confidence?: number }
interface RawParagraph { words?: RawWord[]; boundingBox?: RawPoly; confidence?: number }
interface RawBlock { paragraphs?: RawParagraph[]; boundingBox?: RawPoly; confidence?: number }
interface RawPage { width?: number; height?: number; blocks?: RawBlock[] }
interface VisionResponse {
  responses?: Array<{
    fullTextAnnotation?: { pages?: RawPage[] }
    error?: { code?: number; message?: string; status?: string }
  }>
  error?: { code?: number; message?: string; status?: string }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function verticesToRect(poly: RawPoly | undefined): VisionParagraph['bbox'] | null {
  const vs = poly?.vertices ?? []
  if (vs.length < 3) return null
  const xs = vs.map((v) => v.x ?? 0)
  const ys = vs.map((v) => v.y ?? 0)
  const x0 = Math.min(...xs)
  const y0 = Math.min(...ys)
  const x1 = Math.max(...xs)
  const y1 = Math.max(...ys)
  const w = x1 - x0
  const h = y1 - y0
  if (w <= 0 || h <= 0) return null
  return { left: x0, top: y0, width: w, height: h }
}

function extractWordText(w: RawWord): string {
  return (w.symbols ?? []).map((s) => s.text ?? '').join('')
}

// ─────────────────────────────────────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────────────────────────────────────

export async function decomposeWithGoogleVision(dataUri: string): Promise<VisionDecomposeResult> {
  const apiKey = import.meta.env.VITE_GOOGLE_VISION_API_KEY as string | undefined
  if (!apiKey) throw new Error('VITE_GOOGLE_VISION_API_KEY absente dans .env.local')

  const requestImage = dataUri.startsWith('data:')
    ? { content: dataUri.replace(/^data:[^;]+;base64,/, '') }
    : { source: { imageUri: dataUri } }

  const body = {
    requests: [
      {
        image: requestImage,
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
      },
    ],
  }

  const resp = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const t = await resp.text()
    throw new Error(`Google Vision API ${resp.status} : ${t.slice(0, 300)}`)
  }

  const data = (await resp.json()) as VisionResponse
  const err = data.error || data.responses?.[0]?.error
  if (err) throw new Error(`Google Vision : ${err.message ?? err.status ?? 'erreur'}`)

  const page = data.responses?.[0]?.fullTextAnnotation?.pages?.[0]
  if (!page) return { imageWidth: 0, imageHeight: 0, paragraphs: [] }

  const paragraphs: VisionParagraph[] = []
  for (const b of page.blocks ?? []) {
    for (const p of b.paragraphs ?? []) {
      const bbox = verticesToRect(p.boundingBox)
      if (!bbox) continue
      const words: VisionWord[] = []
      for (const w of p.words ?? []) {
        const wbox = verticesToRect(w.boundingBox)
        const txt = extractWordText(w)
        if (!wbox || !txt) continue
        words.push({ text: txt, bbox: wbox })
      }
      if (words.length === 0) continue
      const text = words.map((w) => w.text).join(' ').replace(/\s+([.,:;%€])/g, '$1').replace(/\s+/g, ' ').trim()
      if (!text) continue
      paragraphs.push({ text, bbox, confidence: p.confidence ?? 0, words })
    }
  }

  return {
    imageWidth: page.width ?? 0,
    imageHeight: page.height ?? 0,
    paragraphs,
  }
}
