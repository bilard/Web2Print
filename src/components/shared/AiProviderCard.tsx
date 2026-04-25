import { useEffect, useRef, useState } from 'react'
import {
  Eye, EyeOff, RotateCcw, CheckCircle2, XCircle, Loader2, Wifi,
  ChevronDown, RefreshCw, Info,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  getApiKey, setApiKey, isApiKeyOverridden, resetApiKey, getEnvDefault, testApiKey,
  type ApiTestResult,
} from '@/lib/apiKeys'
import { type AiProvider, type AiModelInfo } from '@/lib/aiModels'
import { useAiSettingsStore, getEffectiveModelList } from '@/stores/aiSettings.store'

interface AiProviderCardProps {
  provider: AiProvider
  apiKeyId: 'gemini' | 'anthropic' | 'openai'
  label: string
  description: string
  logo?: React.ReactNode
  /** Si true, affiche la note "image gen utilise toujours Nano Banana" (carte Gemini uniquement). */
  noteForGemini?: boolean
}

function formatPricing(pricing: { input: number; output: number }): string {
  if (pricing.input === 0 && pricing.output === 0) return '— · 1M tok'
  const fmt = (n: number) => (n < 1 ? n.toFixed(2) : n.toString())
  return `$${fmt(pricing.input)} in / $${fmt(pricing.output)} out · 1M tok`
}

async function fetchModelsFromProvider(
  provider: AiProvider,
  apiKey: string,
): Promise<AiModelInfo[]> {
  if (provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    })
    if (!res.ok) throw new Error(`Anthropic ${res.status}`)
    const data = await res.json() as { data?: Array<{ id: string; display_name?: string }> }
    return (data.data ?? [])
      .filter((m) => m.id.startsWith('claude-'))
      .map((m) => ({ id: m.id, label: m.display_name ?? m.id, pricing: { input: 0, output: 0 } }))
  }
  if (provider === 'gemini') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
    if (!res.ok) throw new Error(`Gemini ${res.status}`)
    const data = await res.json() as { models?: Array<{ name: string; displayName?: string }> }
    return (data.models ?? [])
      .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName ?? m.name }))
      .filter((m) => m.id.startsWith('gemini-') && !/(image|tts|embedding|aqa)/i.test(m.id))
      .map((m) => ({ id: m.id, label: m.label, pricing: { input: 0, output: 0 } }))
  }
  // openai
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}`)
  const data = await res.json() as { data?: Array<{ id: string }> }
  return (data.data ?? [])
    .filter((m) => m.id.startsWith('gpt-') && !/(audio|realtime|search|tts|whisper|image)/i.test(m.id))
    .map((m) => ({ id: m.id, label: m.id, pricing: { input: 0, output: 0 } }))
}

export function AiProviderCard({ provider, apiKeyId, label, description, logo, noteForGemini }: AiProviderCardProps) {
  // ── API key state (mirrors ApiKeyRow)
  const [editing, setEditing] = useState(false)
  const [visible, setVisible] = useState(false)
  const [keyValue, setKeyValue] = useState(() => getApiKey(apiKeyId))
  const [testStatus, setTestStatus] = useState<ApiTestResult | 'testing' | null>(null)
  const [testMessage, setTestMessage] = useState('')
  const overridden = isApiKeyOverridden(apiKeyId)

  // ── Model selection state
  // Subscribe to both selectedModel[provider] and fetchedModels[provider] so the
  // component re-renders after `Rafraîchir` populates new entries. We don't use
  // the subscribed `fetched` directly — `getEffectiveModelList` re-reads it at
  // render time — but the selector is what triggers the re-render.
  const selectedId = useAiSettingsStore((s) => s.selectedModel[provider])
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const fetchedSubscribe = useAiSettingsStore((s) => s.fetchedModels[provider])
  const setSelectedModel = useAiSettingsStore((s) => s.setSelectedModel)
  const setFetchedModels = useAiSettingsStore((s) => s.setFetchedModels)
  const models = getEffectiveModelList(provider)
  const selected = models.find((m) => m.id === selectedId) ?? models[0]
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

  return (
    <div className="bg-white/[0.03] rounded-xl p-3 flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {logo}
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-white/70">{label}</p>
              {testStatus === 'testing' && <Loader2 className="w-3 h-3 text-white/30 animate-spin" />}
              {testStatus === 'ok' && <CheckCircle2 className="w-3 h-3 text-green-400" />}
              {testStatus === 'error' && <XCircle className="w-3 h-3 text-red-400" />}
              {testStatus === 'empty' && <XCircle className="w-3 h-3 text-white/20" />}
            </div>
            <p className="text-[10px] text-white/30">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={handleTestKey} title="Tester la connexion" className="text-white/20 hover:text-indigo-400 transition-colors p-1 rounded hover:bg-white/5">
            <Wifi className="w-3 h-3" />
          </button>
          {overridden && (
            <button onClick={handleResetKey} title="Réinitialiser (utiliser .env)" className="text-white/20 hover:text-amber-400 transition-colors p-1 rounded hover:bg-white/5">
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

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
  )
}
