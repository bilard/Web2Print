import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Eye, EyeOff, RotateCcw, CheckCircle2, XCircle, Loader2, Wifi,
  ChevronDown, RefreshCw, Info, ExternalLink, Search, ArrowUp, KeyRound,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  getApiKey, setApiKey, isApiKeyOverridden, resetApiKey, getEnvDefault, testApiKey,
  type ApiTestResult,
} from '@/lib/apiKeys'
import { AI_MODELS, type AiProvider } from '@/lib/aiModels'
import { fetchModelsViaServer } from '@/lib/aiModelsListing'
import { useAiSettingsStore, isReasoningProvider, type ReasoningProvider } from '@/stores/aiSettings.store'
import { recordAudit } from '@/lib/auditLog'
import { useTranslation, type TranslationKey } from '@/lib/i18n'

interface AiProviderCardProps {
  provider: AiProvider
  apiKeyId: 'gemini' | 'anthropic' | 'openai' | 'deepseek' | 'qwen' | 'kimi' | 'glm' | 'openrouter'
  labelKey: TranslationKey
  descriptionKey: TranslationKey
  logo?: React.ReactNode
  /** URL de la console pour générer / récupérer la clé API. */
  apiKeyUrl?: string
  /** URL du tableau de bord de facturation du fournisseur (solde, factures). */
  billingUrl?: string
  /** Si true, affiche la note "image gen utilise toujours Image IA" (carte Gemini uniquement). */
  noteForGemini?: boolean
}

function formatPricing(pricing: { input: number; output: number }): string {
  if (pricing.input === 0 && pricing.output === 0) return '— · 1M tok'
  const fmt = (n: number) => (n < 1 ? n.toFixed(2) : n.toString())
  return `$${fmt(pricing.input)} in / $${fmt(pricing.output)} out · 1M tok`
}

export function AiProviderCard({ provider, apiKeyId, labelKey, descriptionKey, logo, apiKeyUrl, billingUrl, noteForGemini }: AiProviderCardProps) {
  const { t } = useTranslation()
  const label = t(labelKey)
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

  // ── Cascade de raisonnement : promotion « Remonter » depuis la carte
  const cascade = useAiSettingsStore((s) => s.reasoningCascade)
  const setCascade = useAiSettingsStore((s) => s.setReasoningCascade)
  const cascadeEligible = isReasoningProvider(provider)
  const cascadePos = cascadeEligible ? cascade.indexOf(provider as ReasoningProvider) + 1 : 0
  const promoteToCascade = () => {
    if (!cascadeEligible || cascadePos > 0) return
    setCascade([...cascade, provider as ReasoningProvider])
    recordAudit({ action: 'settings.ai.model', module: 'settings', targetLabel: label, meta: { cascadeAdded: provider } })
    toast.success(t('aiProvider.promoted', { label }))
  }
  const models = useMemo(() => {
    const catalog = AI_MODELS[provider]
    const seen = new Set(catalog.map((m) => m.id))
    return [...catalog, ...fetched.filter((m) => !seen.has(m.id))]
  }, [provider, fetched])
  const selected =
    models.find((m) => m.id === selectedId) ??
    { id: selectedId, label: selectedId, pricing: { input: 0, output: 0 } }
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Champ de recherche affiché quand la liste est longue (utile surtout pour OpenRouter, ~300 modèles).
  const showSearch = models.length > 10
  const filteredModels = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return models
    return models.filter((m) => m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
  }, [models, query])

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
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) { setPopoverOpen(false); setQuery('') }
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
    // Listing via la CF `listModels` (GET serveur, sans CORS). Le bouton reste
    // cliquable même sans clé perso : le serveur renvoie une erreur claire si la
    // clé manque, plutôt qu'un no-op silencieux.
    setRefreshing(true)
    try {
      const fetched = await fetchModelsViaServer(provider)
      setFetchedModels(provider, fetched)
      const known = new Set(models.map((m) => m.id))
      const newCount = fetched.filter((m) => !known.has(m.id)).length
      toast.success(newCount > 0 ? `${newCount} nouveau(x) modèle(s) trouvé(s)` : t('aiProvider.noNewModel'))
    } catch (e) {
      toast.error(t('aiProvider.fetchError', { message: e instanceof Error ? e.message : t('aiProvider.fetchError.unknown') }))
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
            </div>
            <p className="text-[10px] text-white/30">{t(descriptionKey)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {cascadeEligible && (
            cascadePos > 0 ? (
              <span
                title={`Position ${cascadePos} dans la cascade de raisonnement`}
                className="flex items-center gap-1 text-[10px] font-medium text-violet-300/70 bg-violet-500/10 border border-violet-500/20 rounded-md px-2 py-1"
              >
                <CheckCircle2 className="w-3 h-3" />
                Cascade {cascadePos}
              </span>
            ) : (
              <button
                onClick={(e) => { stop(e); promoteToCascade() }}
                title={t('aiProvider.promote')}
                className="flex items-center gap-1 text-[10px] font-medium text-violet-300/80 hover:text-violet-200 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 rounded-md px-2 py-1 transition-colors"
              >
                <ArrowUp className="w-3 h-3" />
                Remonter
              </button>
            )
          )}
          {apiKeyUrl && (
            <a
              href={apiKeyUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={t('apikey.get')}
              onClick={stop}
              className="text-white/20 hover:text-indigo-400 transition-colors p-1 rounded hover:bg-white/5"
            >
              <KeyRound className="w-3 h-3" />
            </a>
          )}
          {billingUrl && (
            <a
              href={billingUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={t('apikey.billing')}
              onClick={stop}
              className="flex items-center gap-1 text-[10px] text-amber-400/70 hover:text-amber-300 transition-colors"
            >
              <span>{t('apikey.billing.short')}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <button onClick={(e) => { stop(e); handleTestKey() }} title={t('apikey.test')} className="text-white/20 hover:text-indigo-400 transition-colors p-1 rounded hover:bg-white/5">
            <Wifi className="w-3 h-3" />
          </button>
          {overridden && (
            <button onClick={(e) => { stop(e); handleResetKey() }} title={t('apikey.reset')} className="text-white/20 hover:text-amber-400 transition-colors p-1 rounded hover:bg-white/5">
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
            placeholder={t('apikey.placeholder')}
            autoFocus
          />
          <button onClick={() => setVisible(!visible)} className="text-white/30 hover:text-white/60 px-1">
            {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          <button onClick={handleSaveKey} className="text-xs bg-indigo-500 hover:bg-indigo-600 text-[#fff] px-3 py-1.5 rounded-lg transition-colors">
            OK
          </button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-left text-xs font-mono text-white/30 bg-white/5 rounded-lg px-2.5 py-1.5 hover:bg-white/10 transition-colors truncate"
        >
          {overridden ? '••••••••' + keyValue.slice(-4) : getEnvDefault(apiKeyId)}
          {overridden && <span className="ml-2 text-[9px] text-indigo-400">{t('apikey.overridden')}</span>}
        </button>
      )}

      {/* Model selector */}
      <div className="flex flex-col gap-1.5 mt-1">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-white/30">{t('aiProvider.model')}</p>
          <button
            onClick={handleRefreshModels}
            disabled={refreshing}
            title={t('aiProvider.fetchModels')}
            className="flex items-center gap-1 text-[10px] text-white/40 hover:text-indigo-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {refreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Rafraîchir
          </button>
        </div>

        <div className="relative" ref={popoverRef}>
          <button
            onClick={() => setPopoverOpen((v) => { if (v) setQuery(''); return !v })}
            className="w-full flex items-center justify-between bg-white/5 hover:bg-white/10 rounded-lg px-2.5 py-1.5 transition-colors"
          >
            <div className="flex flex-col items-start min-w-0">
              <span className="text-xs text-white/80 truncate">{selected.label}</span>
              <span className="text-[10px] font-mono text-white/30">{formatPricing(selected.pricing)}</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0 ml-2" />
          </button>

          {popoverOpen && (
            <div className="absolute z-10 mt-1 w-full bg-surface border border-white/10 rounded-lg shadow-xl flex flex-col max-h-72">
              {showSearch && (
                <div className="sticky top-0 p-1.5 border-b border-white/5 bg-surface">
                  <div className="flex items-center gap-1.5 bg-white/5 rounded-md px-2 py-1.5">
                    <Search className="w-3 h-3 text-white/30 shrink-0" />
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t('aiProvider.searchModel')}
                      autoFocus
                      className="flex-1 bg-transparent text-xs text-white/80 placeholder:text-white/25 focus:outline-none min-w-0"
                    />
                  </div>
                </div>
              )}
              <div className="overflow-y-auto py-1">
                {filteredModels.length === 0 ? (
                  <p className="px-2.5 py-2 text-[10px] text-white/30">{t('aiProvider.noModel')}</p>
                ) : (
                  filteredModels.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        if (m.id !== selectedId) {
                          recordAudit({ action: 'settings.ai.model', module: 'settings', targetLabel: label, meta: { before: selected.label, after: m.label } })
                        }
                        setSelectedModel(provider, m.id); setPopoverOpen(false); setQuery('')
                      }}
                      className={`w-full flex flex-col items-start px-2.5 py-1.5 hover:bg-white/5 transition-colors ${m.id === selected.id ? 'bg-white/[0.04]' : ''}`}
                    >
                      <span className="text-xs text-white/80">{m.label}</span>
                      <span className="text-[10px] font-mono text-white/30">{formatPricing(m.pricing)}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {noteForGemini && (
        <div className="flex items-start gap-1.5 mt-1 text-[10px] text-white/30">
          <Info className="w-3 h-3 shrink-0 mt-0.5" />
          <span>{t('aiProvider.imageNote')}<code className="font-mono">gemini-3.1-flash-image-preview</code>).</span>
        </div>
      )}
        </div>
      )}
    </div>
  )
}
