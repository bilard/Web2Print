// src/features/workflows/registry/higgsfield.tsx
// Node « Higgsfield » : génération image (Soul) / vidéo (DoP image→vidéo) via le
// callable serveur `higgsfieldGenerate`. Paramètres riches : style preset (106),
// mouvement/caméra (121) chargés en LIVE via `higgsfieldCatalog`, force, seed,
// batch, enhance. Sort des `assets` (URLs CDN) chaînables vers `save-dam`.
// runtime 'any' → jumeau serveur (functions/src/workflow/nodes/higgsfield.ts).
import { useEffect, useState } from 'react'
import { Clapperboard, Loader2, Search } from 'lucide-react'
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
  imageUrl: string
  styleId: string
  styleStrength: number
  motionId: string
  motionStrength: number
  /** '' = graine aléatoire. */
  seed: string
  enhancePrompt: boolean
  batchSize: 1 | 4
}

interface HiggsfieldAsset {
  url: string
  type: 'image' | 'video'
  mimeType: string
  name: string
}

interface HiggsfieldInputs {
  image?: unknown
}

interface CatalogItem {
  id: string
  name: string
}
interface HiggsfieldCatalog {
  soulStyles: CatalogItem[]
  motions: CatalogItem[]
}

interface HiggsfieldPayload {
  mode: 'image' | 'video'
  prompt: string
  aspectRatio: string
  quality: '720p' | '1080p'
  videoModel: 'dop-lite' | 'dop-turbo' | 'dop-standard'
  imageUrl?: string
  styleId?: string
  styleStrength?: number
  motionId?: string
  motionStrength?: number
  seed?: number
  enhancePrompt?: boolean
  batchSize?: 1 | 4
}

const higgsfieldFn = httpsCallable<HiggsfieldPayload, { assets: HiggsfieldAsset[] }>(
  functions,
  'higgsfieldGenerate',
  { timeout: 540_000 },
)

const catalogFn = httpsCallable<Record<string, never>, HiggsfieldCatalog>(functions, 'higgsfieldCatalog')

// Cache module : le catalogue (styles/motions) est global par user → 1 seul fetch.
let catalogCache: Promise<HiggsfieldCatalog> | null = null
function loadCatalog(): Promise<HiggsfieldCatalog> {
  if (!catalogCache) {
    catalogCache = catalogFn({})
      .then((r) => r.data)
      .catch((e) => {
        catalogCache = null // permet un retry au prochain montage
        throw e
      })
  }
  return catalogCache
}

function firstHttpUrl(input: unknown): string {
  if (Array.isArray(input)) {
    for (const a of input) {
      const url = String((a as { url?: unknown; src?: unknown })?.url ?? (a as { src?: unknown })?.src ?? '')
      if (/^https?:\/\//.test(url)) return url
    }
  }
  return ''
}

const inputCls =
  'w-full bg-background border border-neutral-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500'
const labelCls = 'text-[10px] uppercase tracking-wider text-neutral-500 block mb-1'

/** Combobox filtrable sur un catalogue (style ou motion). « Aucun » = preset vide. */
function CatalogSelect({
  label,
  items,
  value,
  onChange,
  loading,
  error,
}: {
  label: string
  items: CatalogItem[]
  value: string
  onChange: (id: string) => void
  loading: boolean
  error: string | null
}) {
  const [q, setQ] = useState('')
  const filtered = q.trim()
    ? items.filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase()))
    : items
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {loading ? (
        <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 py-1">
          <Loader2 className="w-3 h-3 animate-spin" /> Chargement du catalogue…
        </div>
      ) : error ? (
        <p className="text-[11px] text-amber-400/80">{error}</p>
      ) : (
        <>
          <div className="relative mb-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-500 pointer-events-none" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Filtrer (${items.length})…`}
              className={inputCls + ' pl-7 py-1 text-xs'}
            />
          </div>
          <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
            <option value="">Aucun (prompt seul)</option>
            {filtered.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  )
}

function StrengthSlider({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <label className={labelCls}>
        {label} — {Math.round((value ?? 1) * 100)}%
      </label>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-indigo-500"
      />
    </div>
  )
}

function HiggsfieldConfigUi({
  config,
  onChange,
}: {
  config: HiggsfieldConfig
  onChange: (next: HiggsfieldConfig) => void
}) {
  const [catalog, setCatalog] = useState<HiggsfieldCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    loadCatalog()
      .then((c) => alive && (setCatalog(c), setLoading(false)))
      .catch((e: { code?: string; message?: string }) => {
        if (!alive) return
        const msg = String(e?.message ?? '')
        const keyIssue =
          e?.code === 'functions/failed-precondition' || /cl[ée]|key|KEY_ID/i.test(msg)
        setError(
          keyIssue
            ? 'Clé Higgsfield absente ou invalide. Dans Paramètres → Connecteurs, colle l\'ID ET le secret ENSEMBLE au format KEY_ID:KEY_SECRET.'
            : 'Catalogue indisponible — tu peux générer avec le prompt seul.',
        )
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

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
        <>
          <CatalogSelect
            label="Style"
            items={catalog?.soulStyles ?? []}
            value={config.styleId}
            onChange={(id) => onChange({ ...config, styleId: id })}
            loading={loading}
            error={error}
          />
          {config.styleId && (
            <StrengthSlider
              label="Force du style"
              value={config.styleStrength}
              onChange={(v) => onChange({ ...config, styleStrength: v })}
            />
          )}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={labelCls}>Ratio</label>
              <select
                value={config.aspectRatio}
                onChange={(e) => onChange({ ...config, aspectRatio: e.target.value })}
                className={inputCls}
              >
                <option value="1:1">1:1</option>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
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
            <div>
              <label className={labelCls}>Variantes</label>
              <select
                value={String(config.batchSize)}
                onChange={(e) => onChange({ ...config, batchSize: e.target.value === '4' ? 4 : 1 })}
                className={inputCls}
              >
                <option value="1">1</option>
                <option value="4">4</option>
              </select>
            </div>
          </div>
        </>
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
          <CatalogSelect
            label="Mouvement / caméra"
            items={catalog?.motions ?? []}
            value={config.motionId}
            onChange={(id) => onChange({ ...config, motionId: id })}
            loading={loading}
            error={error}
          />
          {config.motionId && (
            <StrengthSlider
              label="Force du mouvement"
              value={config.motionStrength}
              onChange={(v) => onChange({ ...config, motionStrength: v })}
            />
          )}
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
              Higgsfield anime cette image. À défaut, la 1re URL http(s) du port « image ». Pas d'URL blob:/locale.
            </p>
          </div>
        </>
      )}

      {/* Communs */}
      <div className="grid grid-cols-2 gap-2 items-end">
        <div>
          <label className={labelCls}>Seed (vide = aléatoire)</label>
          <input
            type="number"
            value={config.seed}
            onChange={(e) => onChange({ ...config, seed: e.target.value })}
            placeholder="aléatoire"
            className={inputCls}
          />
        </div>
        <label className="flex items-center gap-2 pb-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={config.enhancePrompt}
            onChange={(e) => onChange({ ...config, enhancePrompt: e.target.checked })}
            className="accent-indigo-500"
          />
          <span className="text-[11px] text-neutral-300">Améliorer le prompt</span>
        </label>
      </div>
    </div>
  )
}

const higgsfieldNode: NodeSpec<HiggsfieldConfig, HiggsfieldInputs, { assets: HiggsfieldAsset[] }> = {
  type: 'higgsfield',
  category: 'enrichment',
  label: 'Higgsfield (image/vidéo IA)',
  description:
    'Génère une image (Soul) ou une vidéo (DoP image→vidéo) via Higgsfield — styles & mouvements/caméra du catalogue. Sort des assets chaînables vers Save DAM.',
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
    styleId: '',
    styleStrength: 1,
    motionId: '',
    motionStrength: 1,
    seed: '',
    enhancePrompt: false,
    batchSize: 1,
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

    const seedNum = config.seed.trim() ? Number(config.seed) : undefined

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
      styleId: config.styleId || undefined,
      styleStrength: config.styleStrength,
      motionId: config.motionId || undefined,
      motionStrength: config.motionStrength,
      seed: typeof seedNum === 'number' && Number.isFinite(seedNum) ? seedNum : undefined,
      enhancePrompt: config.enhancePrompt,
      batchSize: config.batchSize,
    })
    ctx.setProgress?.(100)
    const assets = data?.assets ?? []
    if (assets.length === 0) throw new Error('Higgsfield : aucun asset généré (voir logs serveur).')
    ctx.log('info', `${assets.length} asset(s) généré(s).`)
    return { assets }
  },
}

nodeRegistry.register(higgsfieldNode)
