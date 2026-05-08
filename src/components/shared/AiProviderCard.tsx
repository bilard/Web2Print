import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Eye, EyeOff, RotateCcw, CheckCircle2, XCircle, Loader2, Wifi,
  ChevronDown, RefreshCw, Info, ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  getApiKey, setApiKey, isApiKeyOverridden, resetApiKey, getEnvDefault, testApiKey,
  type ApiTestResult,
} from '@/lib/apiKeys'
import { AI_MODELS, type AiProvider, type AiModelInfo } from '@/lib/aiModels'
import { useAiSettingsStore } from '@/stores/aiSettings.store'

interface AiProviderCardProps {
  provider: AiProvider
  apiKeyId: 'gemini' | 'anthropic' | 'openai' | 'deepseek' | 'qwen' | 'kimi' | 'openrouter'
  label: string
  description: string
  logo?: React.ReactNode
  /** URL de la console pour générer / récupérer la clé API. */
  apiKeyUrl?: string
  /** Si true, affiche la note "image gen utilise toujours Nano Banana" (carte Gemini uniquement). */
  noteForGemini?: boolean
}

function formatPricing(pricing: { input: number; output: number }): string {
  if (pricing.input === 0 && pricing.output === 0) return '— · 1M tok'
  const fmt = (n: number) => (n < 1 ? n.toFixed(2) : n.toString())
  return `$${fmt(pricing.input)} in / $${fmt(pricing.output)} out · 1M tok`
}

/** Adapter par provider pour récupérer la liste des modèles texte/JSON.
 *
 *  - `url(apiKey)` : URL de listing ; Gemini passe la clé en query, les autres en header.
 *  - `headers(apiKey)` : optionnel — Anthropic a `x-api-key`, les autres `Bearer`.
 *  - `extract(data)` : map réponse → AiModelInfo[] avec filtres provider-spécifiques.
 *  - `fallbackOnError` : seed list si l'endpoint est 404 (ex. Kimi). Sans ça → throw.
 */
interface ProviderModelsAdapter {
  url: (apiKey: string) => string
  headers?: (apiKey: string) => Record<string, string>
  extract: (data: unknown) => AiModelInfo[]
  fallbackOnError?: AiModelInfo[]
}

function bearer(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}` }
}

function pickArr<T>(data: unknown, key: 'data' | 'models'): T[] {
  if (typeof data !== 'object' || data === null) return []
  const arr = (data as Record<string, unknown>)[key]
  return Array.isArray(arr) ? (arr as T[]) : []
}

const PROVIDER_MODEL_ADAPTERS: Record<AiProvider, ProviderModelsAdapter> = {
  claude: {
    url: () => 'https://api.anthropic.com/v1/models',
    headers: (apiKey) => ({
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }),
    extract: (data) =>
      pickArr<{ id: string; display_name?: string }>(data, 'data')
        .filter((m) => m.id.startsWith('claude-'))
        .map((m) => ({ id: m.id, label: m.display_name ?? m.id, pricing: { input: 0, output: 0 } })),
  },
  gemini: {
    url: (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    extract: (data) =>
      pickArr<{ name: string; displayName?: string }>(data, 'models')
        .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName ?? m.name }))
        .filter((m) => m.id.startsWith('gemini-') && !/(image|tts|embedding|aqa)/i.test(m.id))
        .map((m) => ({ id: m.id, label: m.label, pricing: { input: 0, output: 0 } })),
  },
  openai: {
    url: () => 'https://api.openai.com/v1/models',
    headers: bearer,
    extract: (data) =>
      pickArr<{ id: string }>(data, 'data')
        .filter((m) =>
          (m.id.startsWith('gpt-') || /^o\d/.test(m.id)) &&
          !/(audio|realtime|search|tts|whisper|image|moderation)/i.test(m.id)
        )
        .map((m) => ({ id: m.id, label: m.id, pricing: { input: 0, output: 0 } })),
  },
  deepseek: {
    url: () => 'https://api.deepseek.com/v1/models',
    headers: bearer,
    extract: (data) =>
      pickArr<{ id: string }>(data, 'data')
        .filter((m) => m.id.startsWith('deepseek-'))
        .map((m) => ({ id: m.id, label: m.id, pricing: { input: 0, output: 0 } })),
  },
  qwen: {
    url: () => 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models',
    headers: bearer,
    extract: (data) =>
      pickArr<{ id: string }>(data, 'data')
        .filter((m) => /^qwen/i.test(m.id) && !/(audio|tts|asr|embedding|image|vl-)/i.test(m.id))
        .map((m) => ({ id: m.id, label: m.id, pricing: { input: 0, output: 0 } })),
  },
  openrouter: {
    // OpenRouter expose ~300 modèles avec pricing en USD par TOKEN (string).
    // On convertit en USD par 1M tokens (* 1e6) pour cohérence avec AI_MODELS.
    url: () => 'https://openrouter.ai/api/v1/models',
    headers: bearer,
    extract: (data) => {
      type RawModel = {
        id: string
        name?: string
        pricing?: { prompt?: string; completion?: string }
        architecture?: { modality?: string }
      }
      return pickArr<RawModel>(data, 'data')
        .filter((m) => {
          const mod = m.architecture?.modality ?? ''
          if (/image|audio|embedding/i.test(mod)) return false
          if (/(embedding|tts|whisper|asr|image-generation|moderation)/i.test(m.id)) return false
          return true
        })
        .map((m) => {
          const inUsd = parseFloat(m.pricing?.prompt ?? '0') * 1e6
          const outUsd = parseFloat(m.pricing?.completion ?? '0') * 1e6
          return {
            id: m.id,
            label: m.name ?? m.id,
            pricing: {
              input: Number.isFinite(inUsd) ? inUsd : 0,
              output: Number.isFinite(outUsd) ? outUsd : 0,
            },
          }
        })
    },
  },
  kimi: {
    // Kimi Code (OpenAI-compatible) n'a pas d'endpoint /models documenté ; on tente,
    // et on retombe sur le modèle fixe en cas de 404 ou erreur réseau.
    url: () => 'https://api.kimi.com/coding/v1/models',
    headers: bearer,
    extract: (data) =>
      pickArr<{ id: string }>(data, 'data')
        .filter((m) => /^kimi/i.test(m.id) || /^moonshot/i.test(m.id))
        .map((m) => ({ id: m.id, label: m.id, pricing: { input: 0, output: 0 } })),
    fallbackOnError: [{ id: 'kimi-for-coding', label: 'Kimi for Coding', pricing: { input: 0, output: 0 } }],
  },
}

async function fetchModelsFromProvider(
  provider: AiProvider,
  apiKey: string,
): Promise<AiModelInfo[]> {
  const adapter = PROVIDER_MODEL_ADAPTERS[provider]
  try {
    const res = await fetch(adapter.url(apiKey), {
      headers: adapter.headers?.(apiKey),
    })
    if (!res.ok) {
      if (adapter.fallbackOnError) return adapter.fallbackOnError
      throw new Error(`${provider} ${res.status}`)
    }
    return adapter.extract(await res.json())
  } catch (err) {
    if (adapter.fallbackOnError) return adapter.fallbackOnError
    throw err
  }
}

export function AiProviderCard({ provider, apiKeyId, label, description, logo, apiKeyUrl, noteForGemini }: AiProviderCardProps) {
  // ── API key state (mirrors ApiKeyRow)
  const [editing, setEditing] = useState(false)
  const [visible, setVisible] = useState(false)
  const [keyValue, setKeyValue] = useState(() => getApiKey(apiKeyId))
  const [testStatus, setTestStatus] = useState<ApiTestResult | 'testing' | null>(null)
  const [testMessage, setTestMessage] = useState('')
  const overridden = isApiKeyOverridden(apiKeyId)

  // ── Model selection state
  const selectedId = useAiSettingsStore((s) => s.selectedModel[provider])
  const fetched = useAiSettingsStore((s) => s.fetchedModels[provider])
  const setSelectedModel = useAiSettingsStore((s) => s.setSelectedModel)
  const setFetchedModels = useAiSettingsStore((s) => s.setFetchedModels)
  const models = useMemo(() => {
    const catalog = AI_MODELS[provider]
    const seen = new Set(catalog.map((m) => m.id))
    return [...catalog, ...fetched.filter((m) => !seen.has(m.id))]
  }, [provider, fetched])
  const selected =
    models.find((m) => m.id === selectedId) ??
    { id: selectedId, label: selectedId, pricing: { input: 0, output: 0 } }
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const k = getApiKey(apiKeyId)
    if (k) {
      setTestStatus('testing')
      testApiKey(apiKeyId).then((r) => { setTestStatus(r.status); setTestMessage(r.message) })
    }
  }, [apiKeyId])

  useEffect(() => {
    if (!popoverOpen) return
    const onClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setPopoverOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [popoverOpen])

  const handleSaveKey = () => {
    setApiKey(apiKeyId, keyValue)
    setEditing(false)
    setTestStatus('testing')
    setTestMessage('')
    testApiKey(apiKeyId).then((r) => { setTestStatus(r.status); setTestMessage(r.message) })
  }
  const handleResetKey = () => {
    resetApiKey(apiKeyId)
    setKeyValue(getApiKey(apiKeyId))
    setTestStatus('testing')
    testApiKey(apiKeyId).then((r) => { setTestStatus(r.status); setTestMessage(r.message) })
  }
  const handleTestKey = () => {
    setTestStatus('testing')
    setTestMessage('')
    testApiKey(apiKeyId).then((r) => { setTestStatus(r.status); setTestMessage(r.message) })
  }

  const handleRefreshModels = async () => {
    const key = getApiKey(apiKeyId)
    if (!key) return
    setRefreshing(true)
    try {
      const fetched = await fetchModelsFromProvider(provider, key)
      setFetchedModels(provider, fetched)
      const known = new Set(models.map((m) => m.id))
      const newCount = fetched.filter((m) => !known.has(m.id)).length
      toast.success(newCount > 0 ? `${newCount} nouveau(x) modèle(s) trouvé(s)` : 'Aucun nouveau modèle')
    } catch (e) {
      toast.error(`Erreur de récupération : ${e instanceof Error ? e.message : 'inconnue'}`)
    } finally {
      setRefreshing(false)
    }
  }

  const [expanded, setExpanded] = useState(false)
  const stop = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <div className="bg-white/[0.03] rounded-xl flex flex-col">
      {/* Header — toggle accordion */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((v) => !v) }
        }}
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/[0.02] rounded-xl transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {logo}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-white tracking-tight">{label}</p>
              {testStatus === 'testing' && <Loader2 className="w-3.5 h-3.5 text-white/30 animate-spin" />}
              {testStatus === 'ok' && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
              {testStatus === 'error' && <XCircle className="w-3.5 h-3.5 text-red-400" />}
              {testStatus === 'empty' && <XCircle className="w-3.5 h-3.5 text-white/20" />}
              {apiKeyUrl && (
                <a
                  href={apiKeyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Obtenir une clé API"
                  onClick={stop}
                  className="flex items-center gap-1 text-[10px] text-indigo-400/70 hover:text-indigo-300 transition-colors"
                >
                  <span>Obtenir une clé</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <p className="text-[10px] text-white/30">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={(e) => { stop(e); handleTestKey() }} title="Tester la connexion" className="text-white/20 hover:text-indigo-400 transition-colors p-1 rounded hover:bg-white/5">
            <Wifi className="w-3 h-3" />
          </button>
          {overridden && (
            <button onClick={(e) => { stop(e); handleResetKey() }} title="Réinitialiser (utiliser .env)" className="text-white/20 hover:text-amber-400 transition-colors p-1 rounded hover:bg-white/5">
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
          <ChevronDown className={`w-4 h-4 text-white/30 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Body — collapsed by default */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 flex flex-col gap-2 border-t border-white/5">
      {testStatus && testStatus !== 'testing' && testMessage && (
        <p className={`text-[10px] ${testStatus === 'ok' ? 'text-green-400/70' : testStatus === 'error' ? 'text-red-400/70' : 'text-white/20'}`}>
          {testMessage}
        </p>
      )}

      {/* API key */}
      {editing ? (
        <div className="flex gap-1.5">
          <input
            type={visible ? 'text' : 'password'}
            value={keyValue}
            onChange={(e) => setKeyValue(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500/50"
            placeholder="Entrer la clé API..."
            autoFocus
          />
          <button onClick={() => setVisible(!visible)} className="text-white/30 hover:text-white/60 px-1">
            {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          <button onClick={handleSaveKey} className="text-xs bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg transition-colors">
            OK
          </button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-left text-xs font-mono text-white/30 bg-white/5 rounded-lg px-2.5 py-1.5 hover:bg-white/10 transition-colors truncate"
        >
          {overridden ? '••••••••' + keyValue.slice(-4) : getEnvDefault(apiKeyId)}
          {overridden && <span className="ml-2 text-[9px] text-indigo-400">(personnalisée)</span>}
        </button>
      )}

      {/* Model selector */}
      <div className="flex flex-col gap-1.5 mt-1">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-white/30">Modèle texte/JSON</p>
          <button
            onClick={handleRefreshModels}
            disabled={!keyValue || refreshing}
            title="Récupérer les modèles disponibles"
            className="flex items-center gap-1 text-[10px] text-white/40 hover:text-indigo-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {refreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Rafraîchir
          </button>
        </div>

        <div className="relative" ref={popoverRef}>
          <button
            onClick={() => setPopoverOpen((v) => !v)}
            className="w-full flex items-center justify-between bg-white/5 hover:bg-white/10 rounded-lg px-2.5 py-1.5 transition-colors"
          >
            <div className="flex flex-col items-start min-w-0">
              <span className="text-xs text-white/80 truncate">{selected.label}</span>
              <span className="text-[10px] font-mono text-white/30">{formatPricing(selected.pricing)}</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0 ml-2" />
          </button>

          {popoverOpen && (
            <div className="absolute z-10 mt-1 w-full bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl py-1 max-h-72 overflow-y-auto">
              {models.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setSelectedModel(provider, m.id); setPopoverOpen(false) }}
                  className={`w-full flex flex-col items-start px-2.5 py-1.5 hover:bg-white/5 transition-colors ${m.id === selected.id ? 'bg-white/[0.04]' : ''}`}
                >
                  <span className="text-xs text-white/80">{m.label}</span>
                  <span className="text-[10px] font-mono text-white/30">{formatPricing(m.pricing)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {noteForGemini && (
        <div className="flex items-start gap-1.5 mt-1 text-[10px] text-white/30">
          <Info className="w-3 h-3 shrink-0 mt-0.5" />
          <span>La génération d'image utilise toujours Nano Banana (<code className="font-mono">gemini-3.1-flash-image-preview</code>).</span>
        </div>
      )}
        </div>
      )}
    </div>
  )
}
