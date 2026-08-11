// Cartes du run EN DIRECT, dans l'ordre où elles ont tourné. Un clic ouvre le flux sur la
// carte — même intent que la bande d'avancement de l'éditeur (`useFocusNode`).
//
// ⚠ Le RUN porte son propre bilan, en tête : combien de cartes ont abouti, combien
// tournent, combien ont été sautées. On n'ADDITIONNE PAS les compteurs des cartes — ils
// comptent des choses différentes (des fiches, des lignes de feuille, des règles) et leur
// somme ne voudrait rien dire. Chaque carte porte le sien, avec son unité en infobulle.
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Loader2, AlertCircle, MinusCircle, Circle } from 'lucide-react'
import { useFocusNode } from '../../workflows/editor/focusNodeStore'
import type { NodeStatus } from '../../workflows/types'
import { useLiveRunCards } from './useLiveRunCards'
import { duration } from '../dashboard/format'
import { intlLocale, useTranslation } from '@/lib/i18n'

const ICON: Record<NodeStatus, typeof Circle> = {
  pending: Circle, running: Loader2, success: CheckCircle2, error: AlertCircle, skipped: MinusCircle,
}
const TINT: Record<NodeStatus, string> = {
  pending: 'text-white/25', running: 'text-indigo-300', success: 'text-emerald-400/80',
  error: 'text-rose-400', skipped: 'text-amber-300/70',
}
/** Une carte sautée ou en attente s'efface : elle n'a rien fait, elle ne doit pas peser
 *  autant à l'œil qu'une carte qui a travaillé. */
const WEIGHT: Record<NodeStatus, string> = {
  pending: 'bg-well/40 opacity-50', running: 'bg-indigo-500/10 border border-indigo-400/25',
  success: 'bg-well', error: 'bg-rose-500/10 border border-rose-400/25', skipped: 'bg-well/40 opacity-60',
}

/** Compte par statut, dans l'ordre où on veut le lire. PUR. */
function tally(cards: { status: NodeStatus }[]): { status: NodeStatus; n: number }[] {
  const order: NodeStatus[] = ['running', 'success', 'error', 'skipped', 'pending']
  return order
    .map((status) => ({ status, n: cards.filter((c) => c.status === status).length }))
    .filter((s) => s.n > 0)
}

export function RunCardsStrip({ workflowId }: { workflowId: string | null }) {
  const { t, locale } = useTranslation()
  const navigate = useNavigate()
  const progress = useLiveRunCards(workflowId)

  /** Sélectionne la carte dans l'éditeur (store partagé) puis y navigue — le focus est déjà
   *  posé quand le canvas monte, comme le fait le popup de cohérence. */
  const openCard = (id: string) => {
    if (!workflowId) return
    useFocusNode.getState().focus(id)
    navigate(`/workflows/${workflowId}`)
  }

  // Rien démarré : une bande à zéro se lirait comme une panne plutôt que comme une absence.
  if (!progress || progress.total === 0 || (progress.done === 0 && progress.running === 0)) return null

  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2.5">
        <h3 className="text-sm font-semibold text-white">{t('ops.cards.title')}</h3>
        {/* Le bilan du RUN, là où on le cherche : en tête, pas à déduire des pastilles. */}
        <span className="text-[11px] text-white/45 tabular-nums">
          {t('ops.cards.of', { done: progress.done, total: progress.total })}
        </span>
        {tally(progress.cards).map((s) => (
          <span key={s.status} className={`text-[11px] tabular-nums ${TINT[s.status]}`}>
            {s.n} {t(`ops.cards.state.${s.status}` as 'ops.cards.state.success')}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {progress.cards.map((c) => {
          const Icon = ICON[c.status]
          return (
            <button key={c.id} type="button" onClick={() => openCard(c.id)}
              title={progress.skipped_[c.id] ?? t('ops.cards.open')}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-1 text-[11px] transition-colors hover:bg-white/[0.08] ${WEIGHT[c.status]}`}>
              <Icon className={`w-3 h-3 shrink-0 ${TINT[c.status]} ${c.status === 'running' ? 'animate-spin' : ''}`} />
              <span className={c.status === 'pending' ? 'text-white/30' : 'text-white/70'}>{c.label}</span>
              {/* Le chiffre de la carte, détaché du libellé : collé, il se lisait comme la
                  fin du nom (« Moisson concurrents 138 »).
                  ⚠ En JAUNE, la seule couleur libre de la bande : le vert dit « terminée »,
                  l'indigo « en cours », le rouge « en erreur », le blanc porte les libellés.
                  C'est CE nombre qu'on vient chercher — il ne doit pas se fondre dans son
                  étiquette. */}
              {typeof c.count === 'number' && c.count > 0 && (
                <span className="tabular-nums font-semibold text-amber-300 bg-amber-400/10 rounded px-1 py-px">
                  {c.count.toLocaleString(intlLocale(locale))}
                </span>
              )}
              {(c.cycles ?? 0) > 1 && <span className="tabular-nums text-indigo-300/70">×{c.cycles}</span>}
              {c.durationMs != null && c.durationMs > 1000 && (
                <span className="tabular-nums text-white/25">{duration(c.durationMs)}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ⚠⚠ POURQUOI une carte a été sautée, en clair sous la bande. Mesuré en production :
          la cadence d'envoi suspend l'aval (« Déjà envoyé pour cette période »), donc le
          rapport n'est pas recomposé ni le mail envoyé — et l'utilisateur, relisant le mail
          de la veille, concluait que sa consigne était ignorée. Trois cartes en gris ne
          disaient rien ; la raison dormait dans le journal du run. */}
      {Object.keys(progress.skipped_).length > 0 && (
        <ul className="mt-2 pt-2 border-t border-white/5 space-y-0.5">
          {progress.cards.filter((c) => progress.skipped_[c.id]).map((c) => (
            <li key={c.id} className="text-[11px] text-amber-300/70 flex gap-1.5">
              <MinusCircle className="w-3 h-3 shrink-0 mt-0.5" />
              <span className="text-white/60 shrink-0">{c.label} :</span>
              <span className="min-w-0 truncate" title={progress.skipped_[c.id]}>{progress.skipped_[c.id]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
