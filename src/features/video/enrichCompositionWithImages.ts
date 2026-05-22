import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage, auth } from '@/lib/firebase/config'
import { generateImage } from '@/features/briefs/ai/geminiImageClient'
import type { Composition, Scene, VisualTheme } from './promptToComposition'
import type { AspectFormat } from './types'

/** Mots-clés visuels par theme pour piloter Nano Banana. */
const THEME_KEYWORDS: Record<VisualTheme, string> = {
  dashboard:
    'professional financial trading dashboard interface with live stock charts, candlestick graphs, line plots, donut charts and KPI cards on glowing screens',
  mobile:
    'modern mobile app interface on a sleek smartphone, clean UI cards, premium product showcase',
  ecommerce:
    'editorial product catalog photography, premium retail showcase with sleek product cards',
  data:
    'data analytics workstation with multiple monitors showing graphs, real-time visualizations, and reporting dashboards',
  editorial:
    'editorial magazine cover photography, premium content shoot with shallow depth of field',
  default: 'abstract minimal artistic composition with geometric depth',
}

const ASPECT_TO_RATIO: Record<AspectFormat, '1:1' | '9:16' | '16:9'> = {
  square: '1:1',
  portrait: '9:16',
  landscape: '16:9',
}

interface BuildPromptArgs {
  scene: Scene
  composition: Composition
  topic?: string
  brand?: string
}

function buildImagePrompt(args: BuildPromptArgs): string {
  const { scene, composition, topic, brand } = args
  const themeKw = THEME_KEYWORDS[composition.theme] || THEME_KEYWORDS.default
  const sceneDesc =
    scene.type === 'hook'
      ? 'cinematic opening hero shot'
      : scene.type === 'cta'
      ? 'striking closing visual'
      : 'rich main content showcase'

  const titleHint = scene.title ? ` Featured focus: ${scene.title}.` : ''
  const subHint = scene.sub ? ` Detail: ${scene.sub}.` : ''
  const kpisHint =
    scene.kpis && scene.kpis.length > 0 ? ` Key elements visible: ${scene.kpis.join(', ')}.` : ''
  const brandHint = brand ? ` Brand atmosphere: ${brand}.` : ''
  const topicHint = topic
    ? ` Subject matter: ${topic.replace(/\s+/g, ' ').slice(0, 200)}.`
    : ''

  const palette = composition.palette

  return [
    `${sceneDesc} — ${themeKw}.`,
    titleHint,
    subHint,
    kpisHint,
    topicHint,
    brandHint,
    `Color palette inspiration: deep background tones around ${palette.bg}, vivid accents around ${palette.accent}.`,
    `Style: photorealistic, premium commercial photography, 4K, sharp focus, dramatic lighting, depth of field, sleek high-end corporate vibe, dark elegant atmosphere with glowing accent highlights.`,
    `No visible text, no UI labels, no logos, no watermarks, no captions.`,
  ]
    .filter(Boolean)
    .join(' ')
}

export interface EnrichOptions {
  composition: Composition
  aspect: AspectFormat
  topic?: string
  brand?: string
  onProgress?: (done: number, total: number, sceneIndex?: number) => void
  /** Concurrence max (défaut 2). Nano Banana 2 est lourd ; >3 risque le rate limit. */
  concurrency?: number
}

/** Génère une image par scène via Nano Banana 2, l'upload vers Firebase Storage,
 *  et retourne la composition enrichie avec `imageUrl` sur chaque scène réussie.
 *
 *  Les échecs individuels sont silencieux (warn console) — la scène conserve
 *  son fallback (mockup SVG / décor) si l'image n'a pas pu être générée. */
export async function enrichCompositionWithImages(opts: EnrichOptions): Promise<Composition> {
  const { composition, aspect, topic, brand, onProgress, concurrency = 2 } = opts
  const user = auth.currentUser
  if (!user) throw new Error('Utilisateur non connecté')

  const scenes = composition.scenes
  const enriched = scenes.slice()
  let done = 0

  let cursor = 0
  const worker = async () => {
    while (true) {
      const i = cursor++
      if (i >= scenes.length) return
      const scene = scenes[i]
      const prompt = buildImagePrompt({ scene, composition, topic, brand })
      try {
        const result = await generateImage(prompt, [], {
          aspectRatio: ASPECT_TO_RATIO[aspect],
          imageSize: '1K',
          outputFormat: 'images-only',
        })
        const ext = result.mimeType === 'image/jpeg' ? 'jpg' : 'png'
        const ts = Date.now()
        const path = `video-captures/${user.uid}/img-${ts}-${i}-${Math.random().toString(36).slice(2, 6)}.${ext}`
        const sref = storageRef(storage, path)
        await uploadBytes(sref, result.blob, {
          contentType: result.mimeType,
          cacheControl: 'private, max-age=3600',
        })
        const url = await getDownloadURL(sref)
        enriched[i] = { ...scene, imageUrl: url }
      } catch (err) {
        console.warn(`[enrichComposition] scene ${i} échec :`, err)
      } finally {
        done += 1
        if (onProgress) onProgress(done, scenes.length, i)
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, scenes.length) }, () => worker())
  await Promise.all(workers)

  return { ...composition, scenes: enriched }
}
