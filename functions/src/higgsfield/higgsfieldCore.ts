// functions/src/higgsfield/higgsfieldCore.ts
// Cœur PARTAGÉ de l'intégration Higgsfield (SDK officiel @higgsfield/client, v2
// pour la génération, v1 pour le catalogue ; server-side only). Appelé par le
// callable `higgsfieldGenerate`/`higgsfieldCatalog` (node client) et par le jumeau
// serveur (cron). Credentials per-user `KEY_ID:KEY_SECRET` → multi-tenant.
//
// ⚠️ L'API live exige `input: { params: {...} }` (le SDK 0.2.1 envoie `input` à
// plat — vérifié en live : sinon 422 « body.params: Field required »).
import { createHiggsfieldClient } from '@higgsfield/client/v2'
import { HiggsfieldClient } from '@higgsfield/client'

type HiggsfieldMode = 'image' | 'video'

export interface HiggsfieldParams {
  mode: HiggsfieldMode
  prompt: string
  /** Ratio logique (mappé en taille Soul pour l'image). */
  aspectRatio?: string
  /** Qualité Soul (image). */
  quality?: '720p' | '1080p'
  /** URL PUBLIQUE de l'image source (requise en mode vidéo image→vidéo). */
  imageUrl?: string
  /** Modèle DoP (vidéo). */
  videoModel?: 'dop-lite' | 'dop-turbo' | 'dop-standard'
  // ── Paramètres avancés ──
  /** Style Soul (id du catalogue `/v1/text2image/soul-styles`). */
  styleId?: string
  /** Force du style 0..1. */
  styleStrength?: number
  /** Mouvement/caméra DoP (id du catalogue `/v1/motions`). */
  motionId?: string
  /** Force du mouvement 0..1. */
  motionStrength?: number
  /** Graine déterministe (reproductibilité). */
  seed?: number
  /** Amélioration automatique du prompt par Higgsfield. */
  enhancePrompt?: boolean
  /** Nombre d'images Soul (1 ou 4). */
  batchSize?: 1 | 4
}

export interface HiggsfieldAsset {
  url: string
  type: HiggsfieldMode
  mimeType: string
  name: string
}

interface CatalogItem {
  id: string
  name: string
}
export interface HiggsfieldCatalog {
  soulStyles: CatalogItem[]
  motions: CatalogItem[]
}

/** Ratio → taille Soul (valeurs réelles du SDK `SoulSize`). */
const SOUL_SIZE: Record<string, string> = {
  '1:1': '1536x1536',
  '16:9': '2048x1152',
  '9:16': '1152x2048',
  '4:3': '2048x1536',
  '3:4': '1536x2048',
}

function assertCreds(credentials: string): void {
  if (!credentials || !credentials.includes(':')) {
    throw new Error('Clé Higgsfield invalide — format attendu « KEY_ID:KEY_SECRET ».')
  }
}

function clamp01(v: number | undefined, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : dflt
}

/** Lance une génération Higgsfield (polling synchrone) et retourne les assets
 *  (URLs CDN Higgsfield). Lève une erreur claire si le statut n'est pas `completed`. */
export async function runHiggsfield(
  credentials: string,
  p: HiggsfieldParams,
): Promise<HiggsfieldAsset[]> {
  assertCreds(credentials)
  const prompt = (p.prompt || '').trim()
  if (!prompt) throw new Error('Prompt manquant.')

  // maxPollTime < timeout de la fonction (540 s). Vidéo = quelques minutes.
  const client = createHiggsfieldClient({ credentials, maxPollTime: 500_000 })

  if (p.mode === 'video') {
    const imageUrl = (p.imageUrl || '').trim()
    if (!/^https?:\/\//.test(imageUrl)) {
      throw new Error(
        'Mode vidéo : une URL d\'image PUBLIQUE (http/https) est requise en entrée. ' +
          'Une URL blob:/locale n\'est pas accessible par Higgsfield.',
      )
    }
    const params: Record<string, unknown> = {
      model: p.videoModel ?? 'dop-turbo',
      prompt,
      input_images: [{ type: 'image_url', image_url: imageUrl }],
    }
    if (p.motionId) params.motions = [{ id: p.motionId, strength: clamp01(p.motionStrength, 1) }]
    if (typeof p.seed === 'number' && Number.isFinite(p.seed)) params.seed = Math.floor(p.seed)
    if (p.enhancePrompt) params.enhance_prompt = true

    const res = await client.subscribe('/v1/image2video/dop', { input: { params }, withPolling: true })
    if (res.status !== 'completed') throw new Error(`Higgsfield (vidéo) : statut « ${res.status} ».`)
    const url = res.video?.url
    if (!url) throw new Error('Higgsfield : aucune vidéo retournée.')
    return [{ url, type: 'video', mimeType: 'video/mp4', name: `higgsfield_${res.request_id}.mp4` }]
  }

  // mode image (Soul text-to-image)
  const params: Record<string, unknown> = {
    prompt,
    width_and_height: SOUL_SIZE[p.aspectRatio ?? '1:1'] ?? SOUL_SIZE['1:1'],
    quality: p.quality ?? '1080p',
    batch_size: p.batchSize === 4 ? 4 : 1,
  }
  if (p.styleId) {
    params.style_id = p.styleId
    params.style_strength = clamp01(p.styleStrength, 1)
  }
  if (typeof p.seed === 'number' && Number.isFinite(p.seed)) params.seed = Math.floor(p.seed)
  if (p.enhancePrompt) params.enhance_prompt = true

  const res = await client.subscribe('/v1/text2image/soul', { input: { params }, withPolling: true })
  if (res.status !== 'completed') throw new Error(`Higgsfield (image) : statut « ${res.status} ».`)
  const images = res.images ?? []
  if (images.length === 0) throw new Error('Higgsfield : aucune image retournée.')
  return images.map((im, i) => ({
    url: im.url,
    type: 'image' as const,
    mimeType: 'image/jpeg',
    name: `higgsfield_${res.request_id}_${i + 1}.jpg`,
  }))
}

/** Normalise une réponse catalogue (array, {styles}, {motions} ou {data}) en {id,name}. */
function normCatalog(raw: unknown): CatalogItem[] {
  const obj = raw as { styles?: unknown; motions?: unknown; data?: unknown } | null
  const list = Array.isArray(raw) ? raw : (obj?.styles ?? obj?.motions ?? obj?.data ?? [])
  if (!Array.isArray(list)) return []
  return list
    .map((x) => {
      const o = x as { id?: unknown; name?: unknown }
      return { id: String(o?.id ?? ''), name: String(o?.name ?? o?.id ?? '') }
    })
    .filter((x) => x.id)
}

/** Récupère le catalogue live (styles Soul + mouvements DoP). Endpoints GET,
 *  sans crédit. Utilisé pour peupler les sélecteurs du node. */
export async function fetchHiggsfieldCatalog(credentials: string): Promise<HiggsfieldCatalog> {
  assertCreds(credentials)
  const [apiKey, apiSecret] = credentials.split(':')
  const client = new HiggsfieldClient({ apiKey, apiSecret })
  const [styles, motions] = await Promise.all([
    client.getSoulStyles().catch(() => []),
    client.getMotions().catch(() => []),
  ])
  const byName = (a: CatalogItem, b: CatalogItem) => a.name.localeCompare(b.name)
  return {
    soulStyles: normCatalog(styles).sort(byName),
    motions: normCatalog(motions).sort(byName),
  }
}
