import { useEffect, useState } from 'react'
import { Loader2, Sparkles, Wand2, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  generateImprovementQuestions,
  improveImagePrompt,
  type ImproveImageRef,
  type ImprovementAnswer,
  type ImprovementQuestion,
} from '@/features/briefs/ai/improveImagePrompt'

interface Props {
  open: boolean
  onClose: () => void
  brief: string
  refs: ImproveImageRef[]
  onImproved: (prompt: string, answers: ImprovementAnswer[]) => void
}

type Stage = 'loading-questions' | 'answering' | 'generating' | 'error'

/**
 * Modale Q&A pour améliorer un prompt Nano Banana 2 :
 * 1. Gemini analyse le brief + les refs et propose 2-5 questions ciblées
 * 2. L'utilisateur répond (option suggérée ou champ libre)
 * 3. Gemini réécrit le prompt en intégrant les réponses comme source autoritaire
 */
export function ImprovePromptDialog({ open, onClose, brief, refs, onImproved }: Props) {
  const [stage, setStage] = useState<Stage>('loading-questions')
  const [questions, setQuestions] = useState<ImprovementQuestion[]>([])
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setStage('loading-questions')
    setErrorMessage(null)
    setQuestions([])
    setSelections({})
    setCustomInputs({})

    generateImprovementQuestions(brief, refs)
      .then((qs) => {
        if (cancelled) return
        if (qs.length === 0) {
          setErrorMessage('Aucune question pertinente détectée. Lance "Améliorer" directement.')
          setStage('error')
          return
        }
        setQuestions(qs)
        // Présélection : 1re option de chaque question (la suggestion de Gemini).
        const defaultSelections: Record<string, string> = {}
        qs.forEach((q) => {
          if (q.options.length > 0) defaultSelections[q.id] = q.options[0]
        })
        setSelections(defaultSelections)
        setStage('answering')
      })
      .catch((err) => {
        if (cancelled) return
        setErrorMessage(err instanceof Error ? err.message : String(err))
        setStage('error')
      })

    return () => {
      cancelled = true
    }
  }, [open, brief, refs])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stage !== 'generating') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, stage, onClose])

  if (!open) return null

  const handleGenerate = async () => {
    setStage('generating')
    setErrorMessage(null)
    try {
      const answers: ImprovementAnswer[] = questions.map((q) => {
        const sel = selections[q.id] ?? q.options[0] ?? ''
        const final = sel === '__custom__' ? (customInputs[q.id] ?? '').trim() : sel
        return { question: q.question, answer: final || sel }
      })
      const improved = await improveImagePrompt(brief, refs, answers)
      onImproved(improved, answers)
      toast.success(
        refs.length > 0
          ? `Prompt amélioré (${refs.length} image${refs.length > 1 ? 's' : ''} + ${answers.length} précision${answers.length > 1 ? 's' : ''})`
          : `Prompt amélioré (${answers.length} précision${answers.length > 1 ? 's' : ''})`,
      )
      onClose()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
      setStage('error')
    }
  }

  return (
    <div className="fixed inset-0 z-[95] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[90vh] bg-[#1a1a1a] border border-white/10 rounded-xl flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <div className="text-sm font-medium text-white/90">Améliorer avec questions</div>
          </div>
          <button
            onClick={onClose}
            disabled={stage === 'generating'}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
            title="Fermer (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          {stage === 'loading-questions' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-white/60">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
              <div className="text-sm">Analyse du brief et des références…</div>
            </div>
          )}

          {stage === 'error' && (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-white/60">
              <div className="text-sm text-red-300">{errorMessage}</div>
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white/80 transition"
              >
                Fermer
              </button>
            </div>
          )}

          {(stage === 'answering' || stage === 'generating') && questions.length > 0 && (
            <>
              {questions.map((q, qi) => {
                const selected = selections[q.id] ?? q.options[0]
                const isCustom = selected === '__custom__'
                return (
                  <div key={q.id} className="space-y-2">
                    <div className="text-xs font-medium text-white/80">
                      {qi + 1}. {q.question}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {q.options.map((opt, i) => {
                        const active = selected === opt
                        return (
                          <button
                            key={`${q.id}_${i}`}
                            type="button"
                            disabled={stage === 'generating'}
                            onClick={() => setSelections((s) => ({ ...s, [q.id]: opt }))}
                            className={`text-left text-xs px-3 py-2 rounded-lg border transition ${
                              active
                                ? 'bg-indigo-500/20 border-indigo-400/50 text-white'
                                : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                            }`}
                          >
                            {i === 0 && (
                              <span className="text-[9px] text-indigo-300 uppercase mr-1.5">
                                Suggéré
                              </span>
                            )}
                            {opt}
                          </button>
                        )
                      })}
                      <button
                        key={`${q.id}_custom`}
                        type="button"
                        disabled={stage === 'generating'}
                        onClick={() => setSelections((s) => ({ ...s, [q.id]: '__custom__' }))}
                        className={`text-left text-xs px-3 py-2 rounded-lg border transition ${
                          isCustom
                            ? 'bg-indigo-500/20 border-indigo-400/50 text-white'
                            : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                        }`}
                      >
                        Autre…
                      </button>
                    </div>
                    {isCustom && (
                      <input
                        type="text"
                        autoFocus
                        disabled={stage === 'generating'}
                        value={customInputs[q.id] ?? ''}
                        onChange={(e) =>
                          setCustomInputs((c) => ({ ...c, [q.id]: e.target.value }))
                        }
                        placeholder="Ta réponse…"
                        className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/30 outline-none focus:border-indigo-500/50"
                      />
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>

        {/* Footer */}
        {stage !== 'error' && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/5 shrink-0">
            <button
              onClick={onClose}
              disabled={stage === 'generating'}
              className="px-3 py-1.5 text-xs rounded-lg text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              Annuler
            </button>
            <button
              onClick={handleGenerate}
              disabled={stage !== 'answering'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {stage === 'generating' ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Génération…
                </>
              ) : (
                <>
                  <Wand2 className="w-3 h-3" />
                  Générer le prompt
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
