import { useEffect, useRef } from 'react'
import { Loader2, Factory, Check, ExternalLink, AlertCircle, ShieldCheck } from 'lucide-react'
import { CloseButton } from '@/components/shared/CloseButton'
import type { EnrichedProduct } from '@/features/excel/ai-enrichment/types'
import { useManufacturerVerify } from './useManufacturerVerify'
import { ManufacturerVerdict } from './ManufacturerVerdict'
import type { ManufacturerCandidate } from './types'

interface Props {
  rowId: string
  source: EnrichedProduct
  sourceLabel: string
  onClose: () => void
}

const CONF_META: Record<ManufacturerCandidate['confidence'], { label: string; cls: string }> = {
  high:   { label: 'Correspondance forte', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  medium: { label: 'À vérifier',           cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  low:    { label: 'Incertain',            cls: 'text-white/40 bg-white/[0.04] border-white/10' },
}

/** Modal du module « Vérification Fabricant » : confirmation candidat → verdict. */
export function ManufacturerVerifyPanel({ rowId, source, sourceLabel, onClose }: Props) {
  const { phase, candidates, comparisons, summary, mfrName, mfrUrl, error, saving, resolve, confirm } = useManufacturerVerify(rowId)

  // Résoudre les candidats UNE seule fois par fiche. `source` change d'identité à
  // chaque render de ProductSheet (spread) et `save()` déclenche des re-renders du
  // store : sans ce garde, l'effet se relancerait après confirmation et effacerait
  // le verdict. On garde la 1re référence stable de `source` pour cette fiche.
  const resolvedFor = useRef<string | null>(null)
  const sourceRef = useRef(source)
  useEffect(() => {
    if (resolvedFor.current === rowId) return
    resolvedFor.current = rowId
    sourceRef.current = source
    void resolve(sourceRef.current)
  }, [rowId, resolve, source])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl border border-white/10 bg-background shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-white/[0.06] shrink-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
            <Factory className="w-4 h-4 text-indigo-300" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-white">Vérifier la data chez le Fabricant</div>
            <div className="text-[11px] text-white/40 truncate">{sourceLabel}</div>
          </div>
          <CloseButton onClick={onClose} size="sm" />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {(phase === 'resolving' || phase === 'scraping') && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-white/50">
              <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
              <p className="text-[13px]">
                {phase === 'resolving' ? 'Recherche de la page produit officielle…' : 'Extraction des données fabricant…'}
              </p>
            </div>
          )}

          {phase === 'error' && (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <AlertCircle className="w-8 h-8 text-amber-400" />
              <p className="text-[13px] text-white/60 max-w-md">{error}</p>
              <button onClick={() => void resolve(source)}
                className="mt-1 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-[12px] text-white/70 border border-white/10">
                Réessayer
              </button>
            </div>
          )}

          {phase === 'candidates' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2 rounded-lg bg-indigo-500/[0.06] border border-indigo-500/20 px-3.5 py-2.5">
                <ShieldCheck className="w-4 h-4 text-indigo-300 shrink-0 mt-0.5" />
                <p className="text-[12px] text-indigo-200/80">
                  Confirmez la <strong>bonne page produit</strong> du fabricant avant la comparaison. La référence recherchée est indiquée pour vérification.
                </p>
              </div>
              {candidates.map((c) => {
                const meta = CONF_META[c.confidence]
                return (
                  <div key={c.url} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-surface-2 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[13px] font-medium text-white truncate">{c.brand}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-[1px] rounded-full border ${meta.cls}`}>{meta.label}</span>
                      </div>
                      <div className="text-[11px] text-white/45 truncate">{c.title}</div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-white/35">
                        <span className="truncate">{c.domain}</span>
                        {c.matchedRef && <span className="text-indigo-300/70">réf. {c.matchedRef}</span>}
                        <a href={c.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-0.5 text-white/40 hover:text-white/70">
                          <ExternalLink className="w-3 h-3" /> ouvrir
                        </a>
                      </div>
                    </div>
                    <button onClick={() => void confirm(c, sourceRef.current)}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/90 hover:bg-indigo-500 text-[#fff] text-[12px] font-medium transition-colors">
                      <Check className="w-3.5 h-3.5" /> Confirmer
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {phase === 'done' && summary && (
            <ManufacturerVerdict
              sourceUrl={source.sourceUrl}
              sourceLabel={sourceLabel}
              mfrUrl={mfrUrl}
              mfrLabel={mfrName ?? 'Fabricant'}
              summary={summary}
              comparisons={comparisons}
            />
          )}
        </div>

        {/* Footer */}
        {phase === 'done' && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06] shrink-0">
            <span className="text-[11px] text-white/40">
              {saving ? 'Enregistrement…' : 'Données fabricant enregistrées dans la fiche (colonnes « Fabricant · … »).'}
            </span>
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-[12px] text-white/70 border border-white/10">
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
