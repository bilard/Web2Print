// functions/src/higgsfield/higgsfieldCore.ts
// Cœur PARTAGÉ de l'intégration Higgsfield (SDK officiel @higgsfield/client v2,
// server-side only). Appelé à la fois par le callable `higgsfieldGenerate` (node
// client) et par le jumeau serveur du node workflow (cron headless). Prend les
// credentials en argument (clé per-user `KEY_ID:KEY_SECRET`) → multi-tenant.
import { createHiggsfieldClient } from '@higgsfield/client/v2'

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
}

export interface HiggsfieldAsset {
  url: string
  type: HiggsfieldMode
  mimeType: string
  name: string
}

/** Ratio → taille Soul (valeurs réelles du SDK `SoulSize`). */
const SOUL_SIZE: Record<string, string> = {
  '1:1': '1536x1536',
  '16:9': '2048x1152',
  '9:16': '1152x2048',
  '4:3': '2048x1536',
  '3:4': '1536x2048',
}

/** Lance une génération Higgsfield (polling synchrone) et retourne les assets
 *  (URLs CDN Higgsfield). Lève une erreur claire en cas de statut non `completed`. */
export async function runHiggsfield(
  credentials: string,
  p: HiggsfieldParams,
): Promise<HiggsfieldAsset[]> {
  if (!credentials || !credentials.includes(':')) {
    throw new Error('Clé Higgsfield invalide — format attendu « KEY_ID:KEY_SECRET ».')
  }
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
    // L'API live exige un wrapper `params` (le SDK 0.2.1 envoie `input` à plat —
    // vérifié en live : sans `params`, 422 « body.params: Field required »).
    const res = await client.subscribe('/v1/image2video/dop', {
      input: {
        params: {
          model: p.videoModel ?? 'dop-turbo',
          prompt,
          input_images: [{ type: 'image_url', image_url: imageUrl }],
        },
      },
      withPolling: true,
    })
    if (res.status !== 'completed') {
      throw new Error(`Higgsfield (vidéo) : statut « ${res.status} ».`)
    }
    const url = res.video?.url
    if (!url) throw new Error('Higgsfield : aucune vidéo retournée.')
    return [{ url, type: 'video', mimeType: 'video/mp4', name: `higgsfield_${res.request_id}.mp4` }]
  }

  // mode image (Soul text-to-image) — wrapper `params` requis (cf. ci-dessus).
  const res = await client.subscribe('/v1/text2image/soul', {
    input: {
      params: {
        prompt,
        width_and_height: SOUL_SIZE[p.aspectRatio ?? '1:1'] ?? SOUL_SIZE['1:1'],
        quality: p.quality ?? '1080p',
        batch_size: 1,
      },
    },
    withPolling: true,
  })
  if (res.status !== 'completed') {
    throw new Error(`Higgsfield (image) : statut « ${res.status} ».`)
  }
  const images = res.images ?? []
  if (images.length === 0) throw new Error('Higgsfield : aucune image retournée.')
  return images.map((im, i) => ({
    url: im.url,
    type: 'image' as const,
    mimeType: 'image/jpeg',
    name: `higgsfield_${res.request_id}_${i + 1}.jpg`,
  }))
}
