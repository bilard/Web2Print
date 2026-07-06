// src/features/catalog/charte/inspiration.ts
// « Source d'inspiration » par URL (Dribbble, Behance, Pinterest, n'importe quelle
// page ou image directe) : récupère le VISUEL principal (og:image via la CF
// fetchPageHtml, octets via la CF imageProxy — CORS/SSRF gérés serveur), en
// extrait la palette PIXELS, puis fait ANALYSER le design par la Vision LLM
// (mise en page, grille, hiérarchie, badges, ambiance) → tout fusionne dans la
// CHARTE, qui pilote déjà le plan IA. Cf. skill projet `catalog-inspiration`.
import { z } from 'zod'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'
import { generateJson } from '@/features/ai/llmRouter'
import type { CatalogCharte } from '../catalogTypes'
import { paletteFromCanvas } from './extractCharte'

const imageProxyFn = httpsCallable<{ url: string }, { data: string; mimeType: string }>(functions, 'imageProxy')

const IMG_EXT_RE = /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i

/** Visuel principal d'une page : og:image / twitter:image / 1re grande <img>. */
async function resolveMainImageUrl(url: string): Promise<string> {
  if (IMG_EXT_RE.test(url)) return url
  const { fetchSourceHtml } = await import('@/features/scraping-templates/fetchSourceHtml')
  const html = await fetchSourceHtml(url, 20_000)
  if (!html) throw new Error('page inaccessible')
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const meta = doc.querySelector('meta[property="og:image"], meta[property="og:image:url"], meta[name="twitter:image"]')?.getAttribute('content')
  if (meta) return new URL(meta, url).href
  const img = [...doc.querySelectorAll('img[src]')].map((i) => i.getAttribute('src')!)
    .find((s) => IMG_EXT_RE.test(s) && !/logo|icon|avatar|sprite/i.test(s))
  if (img) return new URL(img, url).href
  throw new Error('aucun visuel principal détecté sur la page')
}

const AnalysisSchema = z.object({
  palette: z.array(z.string()).max(8),
  designBrief: z.string(),
})

const ANALYSIS_SCHEMA_FOR_LLM: Record<string, unknown> = {
  type: 'object',
  properties: {
    palette: { type: 'array', items: { type: 'string' }, description: '4 à 8 couleurs hex #rrggbb RÉELLEMENT dominantes dans le visuel, ordonnées par importance' },
    designBrief: {
      type: 'string',
      description:
        "Brief de direction artistique EN FRANÇAIS (8-14 phrases denses) décrivant CE visuel pour le reproduire dans un catalogue produit : " +
        "mise en page et grille (colonnes, densité produits/page, tailles relatives des cartes), hiérarchie typographique (styles de titres/prix/descriptions, casse, graisse), " +
        "traitement des images produit (fonds, ombres, détourage), badges/prix/promotions (formes, angles, positions), " +
        "usage des couleurs (rôle de chaque teinte : fonds, accents, texte), ambiance générale et interdits (ce que ce style NE fait PAS).",
    },
  },
  required: ['palette', 'designBrief'],
}

const HEX_RE = /^#[0-9a-f]{6}$/i

/**
 * Analyse une URL d'inspiration et FUSIONNE le résultat dans la charte :
 * palette pixels + palette Vision (dédupliquées), brief de design en consignes.
 */
export async function analyzeInspirationUrl(rawUrl: string, base: CatalogCharte): Promise<CatalogCharte> {
  const url = /^https?:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`
  const imageUrl = await resolveMainImageUrl(url)
  const { data } = await imageProxyFn({ url: imageUrl })
  const { data: b64, mimeType } = data
  const dataUri = `data:${mimeType};base64,${b64}`
  // Palette PIXELS (vérité terrain) — la Vision complète avec les teintes de rôle.
  const img = new Image()
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('image illisible')); img.src = dataUri })
  const canvas = document.createElement('canvas')
  const k = Math.min(1, 128 / Math.max(img.width, img.height))
  canvas.width = Math.max(1, Math.round(img.width * k)); canvas.height = Math.max(1, Math.round(img.height * k))
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
  const pixelColors = paletteFromCanvas(canvas)

  const analysis = await generateJson<z.infer<typeof AnalysisSchema>>({
    task: 'catalog.inspiration',
    version: 'catalog.inspiration.v1',
    prompt:
      `Tu es directeur artistique print/retail. Analyse ce visuel d'INSPIRATION (référence de design trouvée par l'utilisateur : ${url}) ` +
      `pour qu'un catalogue produit multi-page soit généré avec LE MÊME look, la même mise en page et la même ambiance.`,
    schema: AnalysisSchema,
    schemaForLLM: ANALYSIS_SCHEMA_FOR_LLM,
    imageDataUris: [dataUri],
  })
  const visionColors = analysis.palette.map((c) => c.trim().toLowerCase()).filter((c) => HEX_RE.test(c))
  // Vision d'abord (couleurs de RÔLE), pixels ensuite (complément), dédup.
  const colors = [...new Set([...visionColors, ...pixelColors, ...base.colors])].slice(0, 10)
  const brief = `INSPIRATION (${url}) — reproduire ce design : ${analysis.designBrief}`
  const notes = base.notes ? `${base.notes}\n\n${brief}` : brief
  const label = `🔗 ${new URL(url).hostname}`
  return { ...base, files: [...base.files.filter((f) => f !== label), label].slice(-6), colors, fonts: base.fonts, notes }
}
