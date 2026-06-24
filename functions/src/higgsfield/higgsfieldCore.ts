// functions/src/higgsfield/higgsfieldCore.ts
// Cœur PARTAGÉ de l'intégration Higgsfield (SDK officiel @higgsfield/client, v2
// pour la génération, v1 pour le catalogue ; server-side only). Appelé par le
// callable `higgsfieldGenerate`/`higgsfieldCatalog` (node client) et par le jumeau
// serveur (cron). Credentials per-user `KEY_ID:KEY_SECRET` → multi-tenant.
//
// ⚠️ On utilise le client v1 `HiggsfieldClient.generate()` (PAS le v2 `subscribe`).
// Vérifié en live : v1 `generate(endpoint, params, {withPolling})` wrappe les params
// dans `{ params }` (requis par l'API) ET poll jusqu'à complétion (résultats dans
// `jobs[].results.raw.url`). Le v2 `subscribe` est cassé ici : il n'enveloppe pas
// `params` et rend un JobSet « queued » sans attendre la fin.
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

  const [apiKey, apiSecret] = credentials.split(':')
  // maxPollTime < timeout de la fonction (540 s). Vidéo = quelques minutes.
  const client = new HiggsfieldClient({ apiKey, apiSecret, maxPollTime: 500_000 })

  // Construit l'endpoint + les params (PLATS : `generate` les wrappe dans `{params}`).
  let endpoint: string
  const params: Record<string, unknown> = { prompt }
  if (p.mode === 'video') {
    const imageUrl = (p.imageUrl || '').trim()
    if (!/^https?:\/\//.test(imageUrl)) {
      throw new Error(
        'Mode vidéo : une URL d\'image PUBLIQUE (http/https) est requise en entrée. ' +
          'Une URL blob:/locale n\'est pas accessible par Higgsfield.',
      )
    }
    endpoint = '/v1/image2video/dop'
    params.model = p.videoModel ?? 'dop-turbo'
    params.input_images = [{ type: 'image_url', image_url: imageUrl }]
    if (p.motionId) params.motions = [{ id: p.motionId, strength: clamp01(p.motionStrength, 1) }]
  } else {
    endpoint = '/v1/text2image/soul'
    params.width_and_height = SOUL_SIZE[p.aspectRatio ?? '1:1'] ?? SOUL_SIZE['1:1']
    params.quality = p.quality ?? '1080p'
    params.batch_size = p.batchSize === 4 ? 4 : 1
    if (p.styleId) {
      params.style_id = p.styleId
      params.style_strength = clamp01(p.styleStrength, 1)
    }
  }
  if (typeof p.seed === 'number' && Number.isFinite(p.seed)) params.seed = Math.floor(p.seed)
  if (p.enhancePrompt) params.enhance_prompt = true

  const jobSet = await client.generate(endpoint, params, { withPolling: true })
  if (jobSet.isNsfw) throw new Error('Higgsfield : contenu refusé (NSFW).')
  if (jobSet.isFailed || !jobSet.isCompleted) {
    throw new Error(`Higgsfield : génération non aboutie (failed=${jobSet.isFailed}, completed=${jobSet.isCompleted}).`)
  }

  const type: HiggsfieldMode = p.mode === 'video' ? 'video' : 'image'
  const assets: HiggsfieldAsset[] = []
  for (const job of jobSet.jobs ?? []) {
    const url = job.results?.raw?.url || job.results?.min?.url
    if (!url) continue
    const mimeType = url.endsWith('.mp4')
      ? 'video/mp4'
      : url.endsWith('.webp')
        ? 'image/webp'
        : url.endsWith('.png')
          ? 'image/png'
          : type === 'video'
            ? 'video/mp4'
            : 'image/jpeg'
    const ext = mimeType.split('/')[1]
    assets.push({ url, type, mimeType, name: `higgsfield_${job.id}.${ext}` })
  }
  if (assets.length === 0) throw new Error('Higgsfield : aucun résultat exploitable.')
  return assets
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
