import { Sparkles, ChevronUp, ChevronDown, X } from 'lucide-react'
import { useAiSettingsStore, getSelectedModel, type ReasoningProvider } from '@/stores/aiSettings.store'
import type { AiProvider } from '@/lib/aiModels'
import { GeminiLogo, ClaudeLogo, OpenAILogo, DeepSeekLogo, QwenLogo, GLMLogo, OpenRouterLogo } from './providerLogos'
import { t } from '@/lib/i18n'

const CASCADE_PROVIDER_INFO: Record<ReasoningProvider, { label: string; sub: string; logo: React.ReactNode }> = {
  gemini:     { label: 'Gemini',      sub: t('ai.gemini.sub'),          logo: <GeminiLogo /> },
  claude:     { label: 'Claude Opus', sub: t('ai.claude.sub'),     logo: <ClaudeLogo /> },
  openai:     { label: 'OpenAI',      sub: 'GPT · json_schema strict',        logo: <OpenAILogo /> },
  deepseek:   { label: 'DeepSeek',    sub: 'low cost · JSON natif',           logo: <DeepSeekLogo /> },
  qwen:       { label: 'Qwen',        sub: 'multilingue · alternatif',        logo: <QwenLogo /> },
  glm:        { label: 'GLM (Z.ai)',  sub: 'GLM 5.2 · JSON · bon rapport',    logo: <GLMLogo /> },
  openrouter: { label: 'OpenRouter',  sub: t('ai.openrouter.sub'),  logo: <OpenRouterLogo /> },
}

export function AiCascadeEditor() {
  const cascade = useAiSettingsStore((s) => s.reasoningCascade)
  const setCascade = useAiSettingsStore((s) => s.setReasoningCascade)

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

  return (
    <div className="bg-white/[0.03] rounded-xl p-3 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white tracking-tight">Cascade de raisonnement (texte/JSON)</p>
          <p className="text-[10px] text-white/40">
            {t('ai.cascadeHint')}
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
    </div>
  )
}
