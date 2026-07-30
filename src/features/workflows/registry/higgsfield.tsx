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
// `run()` n'est pas un composant : helper `t()` de module (lit la locale courante).
import { t } from '@/lib/i18n'

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
  /** Texte amont (ex. node « Saisie texte ») utilisé comme prompt si le champ est vide. */
  prompt?: unknown
  image?: unknown
}

interface CatalogItem {
  id: string
  name: string
  preview?: string
  description?: string
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

// Télécharge un asset (URL CDN Higgsfield) en File réel pour brancher « Export
// Google Drive » (port `file`). Passe par imageProxy (fetch serveur, contourne
// CORS ; cap 4 Mo) avec repli fetch direct. Best-effort → null si échec.
const imageProxyFn = httpsCallable<{ url: string }, { data: string; mimeType: string }>(functions, 'imageProxy')
function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
async function fetchAssetFile(a: HiggsfieldAsset): Promise<File | null> {
  try {
    const { data } = await imageProxyFn({ url: a.url })
    const mime = data.mimeType || a.mimeType
    return new File([base64ToBlob(data.data, mime)], a.name, { type: mime })
  } catch {
    try {
      const res = await fetch(a.url)
      if (!res.ok) return null
      const blob = await res.blob()
      return blob.size > 0 ? new File([blob], a.name, { type: a.mimeType }) : null
    } catch {
      return null
    }
  }
}

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
          {/* Grille de vignettes : l'aperçu visuel rend les noms cryptiques lisibles. */}
          <div className="grid grid-cols-3 gap-1 max-h-56 overflow-y-auto p-0.5 rounded bg-background border border-neutral-800">
            <CatalogTile
              selected={value === ''}
              onClick={() => onChange('')}
              name="Aucun"
              hint="Prompt seul (sans preset)"
            />
            {filtered.map((i) => (
              <CatalogTile
                key={i.id}
                selected={value === i.id}
                onClick={() => onChange(i.id)}
                name={i.name}
                preview={i.preview}
                hint={i.description || i.name}
              />
            ))}
          </div>
          {value && (
            <p className="text-[10px] text-indigo-300/80 mt-1 truncate">
              Sélection : {items.find((i) => i.id === value)?.name ?? value}
            </p>
          )}
        </>
      )}
    </div>
  )
}

/** Vignette d'un preset (aperçu image/vidéo + nom). Surbrillance si sélectionné. */
function CatalogTile({
  selected,
  onClick,
  name,
  preview,
  hint,
}: {
  selected: boolean
  onClick: () => void
  name: string
  preview?: string
  hint?: string
}) {
  const isVideo = !!preview && /\.(mp4|webm|mov)(\?|$)/i.test(preview)
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={
        'group flex flex-col rounded overflow-hidden border transition-colors text-left ' +
        (selected ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-neutral-800 hover:border-neutral-600')
      }
    >
      <div className="aspect-square w-full bg-neutral-800 overflow-hidden flex items-center justify-center">
        {preview ? (
          isVideo ? (
            <video src={preview} muted playsInline preload="metadata" className="w-full h-full object-cover" />
          ) : (
            <img src={preview} alt={name} loading="lazy" className="w-full h-full object-cover" />
          )
        ) : (
          <span className="text-[9px] text-neutral-600 px-1 text-center leading-tight">{name}</span>
        )}
      </div>
      <span
        className={
          'block text-[9px] leading-tight px-1 py-0.5 truncate ' +
          (selected ? 'text-indigo-200 bg-indigo-500/15' : 'text-neutral-300 bg-neutral-900/60')
        }
      >
        {name}
      </span>
    </button>
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
          <option value="video">{t('node.higgsfield.mode.video')}</option>
        </select>
      </div>

      <div>
        <label className={labelCls}>Prompt</label>
        <textarea
          value={config.prompt}
          onChange={(e) => onChange({ ...config, prompt: e.target.value })}
          rows={3}
          placeholder={t('node.higgsfield.prompt.placeholder')}
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
              <label className={labelCls}>{t('node.higgsfield.quality.label')}</label>
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
            <label className={labelCls}>{t('node.higgsfield.videoModel.label')}</label>
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
          <label className={labelCls}>{t('node.higgsfield.seed.label')}</label>
          <input
            type="number"
            value={config.seed}
            onChange={(e) => onChange({ ...config, seed: e.target.value })}
            placeholder={t('node.higgsfield.seed.placeholder')}
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
          <span className="text-[11px] text-neutral-300">{t('node.higgsfield.enhance.label')}</span>
        </label>
      </div>
    </div>
  )
}

const higgsfieldNode: NodeSpec<HiggsfieldConfig, HiggsfieldInputs, { assets: HiggsfieldAsset[]; file: File | null }> = {
  type: 'higgsfield',
  category: 'enrichment',
  labelKey: 'node.higgsfield.label',
  descriptionKey: 'node.higgsfield.desc',
  icon: Clapperboard,
  connectors: ['higgsfield'],
  inputs: [
    { name: 'prompt', type: 'any', required: false },
    { name: 'image', type: 'asset[]', required: false },
  ],
  outputs: [
    { name: 'assets', type: 'asset[]' },
    { name: 'file', type: 'file' },
  ],
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
    // Le champ config a priorité ; sinon on prend le texte du port « prompt »
    // (ex. relié à un node « Saisie texte »).
    const fromPort = typeof inputs.prompt === 'string' ? inputs.prompt.trim() : ''
    const prompt = config.prompt?.trim() || fromPort
    if (!prompt) {
      throw new Error(t('run.hf.noPrompt'))
    }
    const mode = config.mode === 'video' ? 'video' : 'image'

    let imageUrl: string | undefined
    if (mode === 'video') {
      imageUrl = (config.imageUrl || '').trim()
      if (!/^https?:\/\//.test(imageUrl)) imageUrl = firstHttpUrl(inputs.image)
      if (!imageUrl || !/^https?:\/\//.test(imageUrl)) {
        throw new Error(t('run.hf.videoNeedsImage'))
      }
    }

    const seedNum = config.seed.trim() ? Number(config.seed) : undefined

    ctx.reportConnector?.('higgsfield')
    ctx.log('info', t('run.hf.generatingLong', { mode }))
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
    if (assets.length === 0) throw new Error(t('run.hf.noAsset'))
    ctx.log('info', t('run.hf.generatedShort', { count: assets.length }))
    // `file` = 1er asset téléchargé en fichier réel → pour « Export Google Drive »
    // (port `file`). Best-effort ; les gros fichiers (>4 Mo, ex. vidéo) → null,
    // utiliser « Save DAM » (port `assets`) dans ce cas.
    const file = await fetchAssetFile(assets[0])
    if (!file) ctx.log('warn', t('run.hf.notDownloadable'))
    return { assets, file }
  },
}

nodeRegistry.register(higgsfieldNode)
