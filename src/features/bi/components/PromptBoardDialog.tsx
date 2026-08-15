// Décrire ce qu'on veut voir, et l'obtenir. La porte d'entrée du module pour qui ne sait pas
// encore par quel visuel commencer.
//
// ⚠⚠ Ce que le modèle a proposé et qu'on a REFUSÉ s'affiche. Un tableau qui arrive avec deux
// tuiles au lieu de six, sans un mot, laisse croire à un bug du module ; nommer le refus dit
// à qui lit que sa demande portait sur un champ que la source ne connaît pas.
import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n'
import { askBoardPlan } from '../ai/askBoardPlan'
import { planToBoard } from '../ai/boardPlan'
import type { DataSource } from '../registry/types'
import type { SourceId } from '../types'
import type { PlannedBoard } from '../ai/boardPlan'

/** Quelques demandes toutes faites : sur un champ vide, personne ne sait quoi écrire. */
const EXAMPLES: string[] = [
  'bi.prompt.example1',
  'bi.prompt.example2',
  'bi.prompt.example3',
]

export function PromptBoardDialog({ open, onOpenChange, source, sourceId, onPlanned }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  source: DataSource
  sourceId: SourceId
  /** Le tableau prêt à écrire. L'appelant décide où et sous quel identifiant. */
  onPlanned: (board: PlannedBoard) => Promise<void>
}) {
  const { t } = useTranslation()
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const q = question.trim()
    if (!q || busy) return
    setBusy(true)
    try {
      const plan = await askBoardPlan(q, source, t)
      const board = planToBoard(plan, source, sourceId,
        (i) => `t_${Date.now().toString(36)}_${i}`)
      if (board.tiles.length === 0) {
        // ⚠ Refuser plutôt que créer un tableau VIDE : un cadre sans tuile se lit comme une
        // panne, et il faudrait ensuite le supprimer à la main.
        toast.error(board.rejected[0] ?? t('bi.prompt.nothing'))
        return
      }
      if (board.rejected.length > 0) toast.warning(board.rejected.join(' · '))
      await onPlanned(board)
      onOpenChange(false)
      setQuestion('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('bi.prompt.failed'))
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      {/* ⚠ Le fond ferme la fenêtre : sans lui, un utilisateur qui clique à côté croit
          l'écran bloqué. La touche Échap fait de même, plus bas. */}
      <button type="button" aria-label={t('bi.detail.close')} onClick={() => onOpenChange(false)}
        className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-lg rounded-xl border border-white/10 bg-surface p-4 shadow-2xl flex flex-col gap-3"
        onKeyDown={(e) => { if (e.key === 'Escape') onOpenChange(false) }}>
        <div>
          <h2 className="flex items-center gap-2 text-[14px] font-semibold text-white">
            <Sparkles className="w-4 h-4 text-indigo-400" />{t('bi.prompt.title')}
          </h2>
          <p className="text-[12px] text-white/45 mt-1">
            {t('bi.prompt.subtitle', { source: t(source.labelKey) })}
          </p>
        </div>

        <textarea
          value={question} onChange={(e) => setQuestion(e.target.value)}
          rows={3} autoFocus placeholder={t('bi.prompt.placeholder')}
          /* ⌘/Ctrl+Entrée envoie : la demande tient en une phrase, on ne veut pas viser le
             bouton pour la lancer. */
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit() }}
          className="w-full rounded-lg bg-well border border-white/10 px-3 py-2 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-indigo-500/60 resize-none"
        />

        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((k) => (
            <button key={k} type="button" onClick={() => setQuestion(t(k as never))}
              className="text-[11px] px-2 py-1 rounded bg-white/[0.05] text-white/55 hover:text-white hover:bg-white/[0.09]">
              {t(k as never)}
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={() => onOpenChange(false)}
            className="px-3 py-1.5 text-[12px] text-white/60 hover:text-white">
            {t('bi.detail.close')}
          </button>
          <button type="button" onClick={() => void submit()} disabled={busy || !question.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-[#fff] text-[12px] disabled:opacity-40">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {busy ? t('bi.prompt.working') : t('bi.prompt.create')}
          </button>
        </div>
      </div>
    </div>
  )
}
