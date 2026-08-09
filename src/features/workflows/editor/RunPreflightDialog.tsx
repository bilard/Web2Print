// Popup de cohérence AVANT lancement : liste les trous détectés (source non connectée,
// paramètre / export requis manquant) par carte. L'utilisateur corrige, ou force le
// lancement en connaissance de cause. N'apparaît QUE s'il y a au moins une incohérence.
import { AlertTriangle, ArrowRight, Scissors, Link2, Plug, Merge } from 'lucide-react'
import { CloseButton } from '@/components/shared/CloseButton'
import type { WorkflowIssue, IssueFix } from '../runtime/validateWorkflow'
import { useTranslation } from '@/lib/i18n'

const fixBtn = 'mt-1.5 flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.06] hover:bg-white/[0.12] text-[11px] text-white/70 hover:text-white/90 transition-colors'

interface Props {
  issues: WorkflowIssue[]
  onCancel: () => void
  /** Absent = consultation seule (ouvert depuis le bandeau, pas depuis « Lancer »). */
  onProceed?: () => void
  /** Ferme le popup et saute à la carte concernée (sélection + recadrage). */
  onFocus: (nodeId: string) => void
  /** Retire la carte et recoud le flux. Absent = pas de droit d'écriture. */
  onDropNode?: (nodeId: string, label: string) => void
  /** Branche ce node en amont du comparatif (ordonnancement). */
  onOrderNode?: (nodeId: string, label: string) => void
  /** Câble l'entrée orpheline sur la seule source possible. */
  onWireInput?: (nodeId: string, fix: Extract<IssueFix, { kind: 'wire-input' }>) => void
  /** Ramène toutes les cartes de veille sur un seul suivi. */
  onAlignWatch?: (fix: Extract<IssueFix, { kind: 'align-watch-id' }>) => void
}

export function RunPreflightDialog({ issues, onCancel, onProceed, onFocus, onDropNode, onOrderNode, onWireInput, onAlignWatch }: Props) {
  const { t } = useTranslation()
  // Regroupe par carte pour un affichage lisible. ⚠ La correction reste attachée à SON
  // message : sur une carte qui en porte trois, un bouton en pied de bloc ne disait pas
  // lequel des trois il réparait.
  const byNode = new Map<string, { label: string; points: { message: string; fix?: IssueFix }[] }>()
  for (const i of issues) {
    const entry = byNode.get(i.nodeId) ?? { label: i.nodeLabel, points: [] }
    entry.points.push({ message: i.message, fix: i.fix })
    byNode.set(i.nodeId, entry)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-lg bg-surface border border-neutral-800 rounded-lg p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold">{t('wfc.title')}</h2>
              <p className="text-xs text-white/45">
                {t(issues.length > 1 ? 'wfc.pointsToCheck.many' : 'wfc.pointsToCheck.one', { count: issues.length })}
              </p>
            </div>
          </div>
          <CloseButton onClick={onCancel} title={t('wfc.close')} />
        </div>

        <ul className="space-y-2.5 max-h-[50vh] overflow-y-auto">
          {[...byNode.entries()].map(([nodeId, entry]) => (
            <li key={nodeId} className="bg-well rounded-md p-3">
              <button
                type="button"
                onClick={() => onFocus(nodeId)}
                className="group flex items-center gap-1.5 text-sm font-medium text-white/90 hover:text-indigo-300 mb-1.5 transition-colors"
                title={t('wfc.goToCard')}
              >
                {entry.label}
                <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
              <ul className="space-y-1.5">
                {entry.points.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-white/60">
                    <span className="text-amber-400/70 mt-0.5 shrink-0">•</span>
                    <div className="min-w-0">
                      <span>{p.message}</span>
                      {p.fix?.kind === 'wire-input' && onWireInput && (
                        <button type="button" className={fixBtn}
                          onClick={() => onWireInput(nodeId, p.fix as Extract<IssueFix, { kind: 'wire-input' }>)}>
                          <Plug className="w-3 h-3" />
                          {t('wfc.wireInput', { source: p.fix.sourceLabel })}
                        </button>
                      )}
                      {/* Le geste porte sur PLUSIEURS cartes : le libellé le dit, sinon
                          on croit ne toucher que celle-ci. */}
                      {p.fix?.kind === 'align-watch-id' && onAlignWatch && (
                        <button type="button" className={fixBtn}
                          onClick={() => onAlignWatch(p.fix as Extract<IssueFix, { kind: 'align-watch-id' }>)}>
                          <Merge className="w-3 h-3" />
                          {t('wfc.alignWatch', { count: p.fix.nodeIds.length, watchId: p.fix.watchId })}
                        </button>
                      )}
                      {p.fix?.kind === 'order-before-compare' && onOrderNode && (
                        <button type="button" className={fixBtn} onClick={() => onOrderNode(nodeId, entry.label)}>
                          <Link2 className="w-3 h-3" />
                          {t('wfc.orderNode')}
                        </button>
                      )}
                      {p.fix?.kind === 'drop-node' && onDropNode && (
                        <button type="button" className={fixBtn} onClick={() => onDropNode(nodeId, entry.label)}>
                          <Scissors className="w-3 h-3" />
                          {t('wfc.dropNode')}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <p className="text-[11px] text-white/35 leading-snug">
          {onProceed
            ? t('wfc.forceHint')
            : t('wfc.hint')}
        </p>

        <div className="flex justify-end gap-2 pt-1">
          {onProceed && (
            <button
              onClick={onProceed}
              className="px-3 py-1.5 rounded text-white/50 hover:text-white/80 text-sm transition-colors"
            >
              {t('wfc.runAnyway')}
            </button>
          )}
          <button
            onClick={onCancel}
            className="px-4 py-1.5 rounded bg-indigo-500 hover:bg-indigo-600 text-[#fff] text-sm font-medium"
            autoFocus
          >
            {t(onProceed ? 'wfc.fix' : 'wfc.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
