import { useState } from 'react'
import { ArrowRight, Sparkles, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useGenerateDynamicQuestions } from '@/features/briefs/ai/useGenerateDynamicQuestions'
import { useUpdateBrief } from '@/features/briefs/useBriefMutations'
import { QuestionRenderer } from './QuestionRenderer'
import type { Brief } from '@/features/briefs/types'
import type { Taxonomy } from '@/features/taxonomy/types'

interface Props {
  brief: Brief
  taxonomy: Taxonomy
  onAdvance: () => void
}

export function Step2Questions({ brief, taxonomy, onAdvance }: Props) {
  const generate = useGenerateDynamicQuestions()
  const update = useUpdateBrief()
  const [answers, setAnswers] = useState<Record<string, unknown>>(
    brief.dynamicForm?.answers ?? {},
  )

  const questions = brief.dynamicForm?.questions ?? []
  const hasQuestions = questions.length > 0

  const handleGenerate = async () => {
    try {
      await generate.mutateAsync({ brief, taxonomy })
      toast.success('Questions générées')
    } catch (err) {
      toast.error((err as Error).message || 'Échec de la génération')
    }
  }

  const handleNext = async () => {
    const missing = questions.filter((q) => q.required && (answers[q.id] === undefined || answers[q.id] === ''))
    if (missing.length > 0) {
      toast.error(`Réponses obligatoires manquantes : ${missing.map((q) => q.label).join(', ')}`)
      return
    }
    try {
      await update.mutateAsync({
        briefId: brief.id,
        patch: {
          'dynamicForm.answers': answers,
          currentStep: 3,
        } as never,
      })
      onAdvance()
    } catch (err) {
      toast.error('Erreur lors de la sauvegarde')
      console.error(err)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[14px] font-semibold text-white/80">Questions complémentaires</h2>
              <p className="text-[12px] text-white/40">
                Générées par l'IA à partir du brief client et de la taxonomie.
              </p>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generate.isPending}
              className="flex items-center gap-1.5 text-[12px] text-indigo-300 hover:text-white hover:bg-indigo-500/10 px-3 py-1.5 rounded-md disabled:opacity-50"
            >
              {hasQuestions ? <RefreshCw className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
              {generate.isPending ? 'Génération…' : hasQuestions ? 'Régénérer' : 'Générer les questions'}
            </button>
          </div>

          {!hasQuestions && !generate.isPending && (
            <div className="text-[12px] text-white/40 text-center py-12 border border-dashed border-white/[0.08] rounded-md">
              Cliquez sur « Générer les questions » pour démarrer.
            </div>
          )}

          {hasQuestions && (
            <QuestionRenderer
              questions={questions}
              values={answers}
              onChange={(id, v) => setAnswers((prev) => ({ ...prev, [id]: v }))}
            />
          )}

          {brief.dynamicForm?.aiReasoning && (
            <p className="mt-6 text-[11px] text-white/40 italic">
              IA : {brief.dynamicForm.aiReasoning}
            </p>
          )}
        </div>
      </div>
      <div className="border-t border-white/[0.06] bg-[#141414] px-6 py-3 flex justify-end shrink-0">
        <button
          onClick={handleNext}
          disabled={!hasQuestions || update.isPending}
          className="flex items-center gap-1.5 text-[12px] text-white bg-indigo-500 hover:bg-indigo-600 px-4 py-2 rounded-md disabled:opacity-50"
        >
          Étape suivante
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
