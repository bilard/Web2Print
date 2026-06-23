// src/features/workflows/registry/higgsfield.tsx
// Node « Higgsfield » : génération image/vidéo IA (Soul, DoP…) via le callable
// serveur `higgsfieldGenerate` (la clé per-user ne transite jamais par le client).
// Sort des `assets` (URLs CDN) chaînables vers `save-dam`. runtime 'any' → jumeau
// serveur pour le cron (functions/src/workflow/nodes/higgsfield.ts).
import { Clapperboard } from 'lucide-react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'

interface HiggsfieldConfig {
  mode: 'image' | 'video'
  prompt: string
  aspectRatio: string
  quality: '720p' | '1080p'
  videoModel: 'dop-lite' | 'dop-turbo' | 'dop-standard'
  /** URL publique de l'image source (mode vidéo) — sinon lue du port `image`. */
  imageUrl: string
}

interface HiggsfieldAsset {
  url: string
  type: 'image' | 'video'
  mimeType: string
  name: string
}

interface HiggsfieldInputs {
  /** Assets upstream (ex. scrape, génération) — la 1re URL http(s) sert d'image source. */
  image?: unknown
}

// timeout généreux : une vidéo DoP peut prendre quelques minutes (polling serveur).
const higgsfieldFn = httpsCallable<
  Omit<HiggsfieldConfig, 'imageUrl'> & { imageUrl?: string },
  { assets: HiggsfieldAsset[] }
>(functions, 'higgsfieldGenerate', { timeout: 540_000 })

function firstHttpUrl(input: unknown): string {
  if (Array.isArray(input)) {
    for (const a of input) {
      const url = String((a as { url?: unknown; src?: unknown })?.url ?? (a as { src?: unknown })?.src ?? '')
      if (/^https?:\/\//.test(url)) return url
    }
  }
  return ''
}

function HiggsfieldConfigUi({
  config,
  onChange,
}: {
  config: HiggsfieldConfig
  onChange: (next: HiggsfieldConfig) => void
}) {
  const inputCls =
    'w-full bg-background border border-neutral-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500'
  const labelCls = 'text-[10px] uppercase tracking-wider text-neutral-500 block mb-1'
  return (
    <div className="space-y-2.5">
      <div>
        <label className={labelCls}>Type</label>
        <select
          value={config.mode}
          onChange={(e) => onChange({ ...config, mode: e.target.value as HiggsfieldConfig['mode'] })}
          className={inputCls}
        >
          <option value="image">Image (Soul text→image)</option>
          <option value="video">Vidéo (DoP image→vidéo)</option>
        </select>
      </div>

      <div>
        <label className={labelCls}>Prompt</label>
        <textarea
          value={config.prompt}
          onChange={(e) => onChange({ ...config, prompt: e.target.value })}
          rows={3}
          placeholder="Décris le rendu souhaité…"
          className={inputCls + ' resize-y'}
        />
      </div>

      {config.mode === 'image' ? (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Ratio</label>
            <select
              value={config.aspectRatio}
              onChange={(e) => onChange({ ...config, aspectRatio: e.target.value })}
              className={inputCls}
            >
              <option value="1:1">Carré (1:1)</option>
              <option value="16:9">Paysage (16:9)</option>
              <option value="9:16">Vertical (9:16)</option>
              <option value="4:3">4:3</option>
              <option value="3:4">3:4</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Qualité</label>
            <select
              value={config.quality}
              onChange={(e) => onChange({ ...config, quality: e.target.value as HiggsfieldConfig['quality'] })}
              className={inputCls}
            >
              <option value="1080p">1080p</option>
              <option value="720p">720p</option>
            </select>
          </div>
        </div>
      ) : (
        <>
          <div>
            <label className={labelCls}>Modèle vidéo</label>
            <select
              value={config.videoModel}
              onChange={(e) => onChange({ ...config, videoModel: e.target.value as HiggsfieldConfig['videoModel'] })}
              className={inputCls}
            >
              <option value="dop-turbo">DoP Turbo (rapide)</option>
              <option value="dop-standard">DoP Standard</option>
              <option value="dop-lite">DoP Lite</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>URL image source (publique)</label>
            <input
              type="text"
              value={config.imageUrl}
              onChange={(e) => onChange({ ...config, imageUrl: e.target.value })}
              placeholder="https://… (ou via le port « image »)"
              className={inputCls}
            />
            <p className="text-[10px] text-neutral-600 leading-snug mt-1">
              Higgsfield anime cette image. À défaut, la 1re URL http(s) du port « image » est utilisée.
              Une URL blob:/locale ne fonctionne pas (doit être accessible publiquement).
            </p>
          </div>
        </>
      )}
    </div>
  )
}

const higgsfieldNode: NodeSpec<HiggsfieldConfig, HiggsfieldInputs, { assets: HiggsfieldAsset[] }> = {
  type: 'higgsfield',
  category: 'enrichment',
  label: 'Higgsfield (image/vidéo IA)',
  description:
    'Génère une image (Soul) ou une vidéo (DoP image→vidéo) via Higgsfield. Sort des assets chaînables vers Save DAM.',
  icon: Clapperboard,
  connectors: ['higgsfield'],
  inputs: [{ name: 'image', type: 'asset[]', required: false }],
  outputs: [{ name: 'assets', type: 'asset[]' }],
  configSchema: [],
  defaultConfig: {
    mode: 'image',
    prompt: '',
    aspectRatio: '1:1',
    quality: '1080p',
    videoModel: 'dop-turbo',
    imageUrl: '',
  },
  runtime: 'any',
  ConfigComponent: HiggsfieldConfigUi,
  cardSummary: (c) => (c.mode === 'video' ? 'Vidéo (DoP)' : 'Image (Soul)'),
  run: async (ctx, config, inputs) => {
    const prompt = config.prompt?.trim()
    if (!prompt) throw new Error('Prompt manquant — saisis une description dans la config du node.')
    const mode = config.mode === 'video' ? 'video' : 'image'

    let imageUrl: string | undefined
    if (mode === 'video') {
      imageUrl = (config.imageUrl || '').trim()
      if (!/^https?:\/\//.test(imageUrl)) imageUrl = firstHttpUrl(inputs.image)
      if (!imageUrl || !/^https?:\/\//.test(imageUrl)) {
        throw new Error(
          'Mode vidéo : fournis une URL d\'image publique (champ « URL image source » ou port « image »).',
        )
      }
    }

    ctx.reportConnector?.('higgsfield')
    ctx.log('info', `Higgsfield ${mode} — génération en cours (peut prendre quelques minutes)…`)
    ctx.setProgress?.(10)
    const { data } = await higgsfieldFn({
      mode,
      prompt,
      aspectRatio: config.aspectRatio,
      quality: config.quality,
      videoModel: config.videoModel,
      imageUrl,
    })
    ctx.setProgress?.(100)
    const assets = data?.assets ?? []
    if (assets.length === 0) throw new Error('Higgsfield : aucun asset généré (voir logs serveur).')
    ctx.log('info', `${assets.length} asset(s) généré(s).`)
    return { assets }
  },
}

nodeRegistry.register(higgsfieldNode)
