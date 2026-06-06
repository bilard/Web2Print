import { useState } from 'react'
import { Sparkles, ChevronUp, ChevronDown, X, Plus } from 'lucide-react'
import { useAiSettingsStore, getSelectedModel, type ReasoningProvider } from '@/stores/aiSettings.store'
import type { AiProvider } from '@/lib/aiModels'
import { GeminiLogo, ClaudeLogo, OpenAILogo, DeepSeekLogo, QwenLogo, OpenRouterLogo } from './providerLogos'

const CASCADE_PROVIDER_INFO: Record<ReasoningProvider, { label: string; sub: string; logo: React.ReactNode }> = {
  gemini:     { label: 'Gemini',      sub: 'free tier · économique',          logo: <GeminiLogo /> },
  claude:     { label: 'Claude Opus', sub: 'pay-as-you-go · qualité max',     logo: <ClaudeLogo /> },
  openai:     { label: 'OpenAI',      sub: 'GPT · json_schema strict',        logo: <OpenAILogo /> },
  deepseek:   { label: 'DeepSeek',    sub: 'low cost · JSON natif',           logo: <DeepSeekLogo /> },
  qwen:       { label: 'Qwen',        sub: 'multilingue · alternatif',        logo: <QwenLogo /> },
  openrouter: { label: 'OpenRouter',  sub: 'agrégateur · routing multi-LLM',  logo: <OpenRouterLogo /> },
}

const ALL_REASONING_PROVIDERS: ReasoningProvider[] = ['gemini', 'claude', 'openai', 'deepseek', 'qwen', 'openrouter']

export function AiCascadeEditor() {
  const cascade = useAiSettingsStore((s) => s.reasoningCascade)
  const setCascade = useAiSettingsStore((s) => s.setReasoningCascade)
  const [adding, setAdding] = useState(false)
  const available = ALL_REASONING_PROVIDERS.filter((p) => !cascade.includes(p))

  const moveUp = (i: number) => {
    if (i === 0) return
    const next = [...cascade]
    ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
    setCascade(next)
  }
  const moveDown = (i: number) => {
    if (i === cascade.length - 1) return
    const next = [...cascade]
    ;[next[i + 1], next[i]] = [next[i], next[i + 1]]
    setCascade(next)
  }
  const remove = (i: number) => {
    if (cascade.length <= 1) return
    setCascade(cascade.filter((_, idx) => idx !== i))
  }
  const add = (p: ReasoningProvider) => {
    setCascade([...cascade, p])
    setAdding(false)
  }

  return (
    <div className="bg-white/[0.03] rounded-xl p-3 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white tracking-tight">Cascade de raisonnement (texte/JSON)</p>
          <p className="text-[10px] text-white/40">
            Pour le scraping produit, la composition Art Director et l'amélioration de prompt. Premier provider essayé en priorité, suivants en fallback automatique.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 mt-1">
        {cascade.map((p, i) => {
          const info = CASCADE_PROVIDER_INFO[p]
          const canRemove = cascade.length > 1
          return (
            <div
              key={p}
              className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-lg px-2.5 py-2 transition-colors"
            >
              <span className="w-5 h-5 rounded bg-violet-500/15 text-violet-300 text-[10px] font-mono font-semibold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              {info.logo}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white">{info.label}</p>
                <p className="text-[10px] text-white/40">{info.sub}</p>
                <p className="text-[9.5px] font-mono text-violet-300/70 mt-0.5 truncate">{getSelectedModel(p as AiProvider)}</p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => moveUp(i)}
                  disabled={i === 0}
                  title="Monter"
                  className="text-white/40 hover:text-violet-300 disabled:opacity-20 disabled:cursor-not-allowed p-1 rounded hover:bg-white/5"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button
                  onClick={() => moveDown(i)}
                  disabled={i === cascade.length - 1}
                  title="Descendre"
                  className="text-white/40 hover:text-violet-300 disabled:opacity-20 disabled:cursor-not-allowed p-1 rounded hover:bg-white/5"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
                <button
                  onClick={() => remove(i)}
                  disabled={!canRemove}
                  title={canRemove ? 'Retirer' : 'Au moins un provider requis'}
                  className="text-white/40 hover:text-red-400 disabled:opacity-20 disabled:cursor-not-allowed p-1 rounded hover:bg-white/5"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {available.length > 0 && !adding && (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center justify-center gap-1.5 text-xs text-white/50 hover:text-violet-300 bg-white/[0.02] hover:bg-white/[0.04] border border-dashed border-white/10 hover:border-violet-500/30 rounded-lg px-3 py-2 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Ajouter un provider en fallback
        </button>
      )}

      {adding && (
        <div className="flex flex-col gap-1 bg-white/[0.04] border border-violet-500/20 rounded-lg p-1">
          {available.map((p) => {
            const info = CASCADE_PROVIDER_INFO[p]
            return (
              <button
                key={p}
                onClick={() => add(p)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/[0.06] transition-colors"
              >
                {info.logo}
                <div className="flex-1 text-left min-w-0">
                  <p className="text-xs font-semibold text-white/80">{info.label}</p>
                  <p className="text-[10px] text-white/40">{info.sub}</p>
                </div>
                <Plus className="w-3 h-3 text-violet-400" />
              </button>
            )
          })}
          <button
            onClick={() => setAdding(false)}
            className="text-[10px] text-white/30 hover:text-white/60 px-2 py-1"
          >
            Annuler
          </button>
        </div>
      )}
    </div>
  )
}
