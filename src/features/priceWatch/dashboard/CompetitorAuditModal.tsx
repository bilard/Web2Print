// src/features/priceWatch/dashboard/CompetitorAuditModal.tsx
// Popup d'audit de la collecte par concurrent : sur les fiches COLLECTÉES (indexées),
// quel % porte chaque champ attendu (prix, prix barré, stock, nom, image, réf).
// Rend visible « rien collecté » vs « champ manquant » vs « scrape complet », pour
// distinguer un vrai trou de parsing d'un site qui ne publie pas la donnée.
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { CompetitorStat, CompetitorAudit } from '../catalog/report'

const FIELDS: { key: Exclude<keyof CompetitorAudit, 'indexed'>; label: string }[] = [
  { key: 'pctPrice', label: 'Prix' },
  { key: 'pctListPrice', label: 'Prix barré' },
  { key: 'pctStock', label: 'Stock' },
  { key: 'pctName', label: 'Nom' },
  { key: 'pctImage', label: 'Image' },
  { key: 'pctRef', label: 'Réf' },
]

/** Fond de cellule selon le taux : rose (0 / faible) → ambre → émeraude. */
function cellStyle(pct: number, indexed: number): { bg: string; txt: string } {
  if (indexed === 0) return { bg: 'transparent', txt: 'text-white/25' }
  if (pct === 0) return { bg: 'rgba(244,63,94,0.20)', txt: 'text-rose-300' }
  if (pct < 40) return { bg: 'rgba(251,146,60,0.16)', txt: 'text-amber-300' }
  if (pct < 80) return { bg: 'rgba(251,191,36,0.12)', txt: 'text-amber-200' }
  return { bg: 'rgba(52,211,153,0.14)', txt: 'text-emerald-300' }
}

export function CompetitorAuditModal({ stats, onClose }: { stats: CompetitorStat[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Rétrocompat : un rapport écrit avant cette feature n'a pas de champ `audit`.
  const EMPTY: CompetitorAudit = { indexed: 0, pctPrice: 0, pctListPrice: 0, pctStock: 0, pctName: 0, pctImage: 0, pctRef: 0 }
  // Les sites qui ont collecté le plus de fiches d'abord ; à collecte égale, alpha.
  const rows = stats
    .map((s) => ({ ...s, audit: s.audit ?? EMPTY }))
    .sort((a, b) => b.audit.indexed - a.audit.indexed || a.domain.localeCompare(b.domain))

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8" onClick={onClose}>
      <div className="w-full max-w-4xl bg-surface rounded-lg border border-white/10 relative max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-surface px-5 py-4 border-b border-white/10 flex items-baseline gap-3">
          <h2 className="text-base font-semibold text-white">Audit de la collecte par concurrent</h2>
          <span className="text-[11px] text-white/40">% des fiches collectées portant chaque champ</span>
          <button type="button" onClick={onClose} title="Fermer (Échap)"
            className="ml-auto p-1.5 rounded bg-well border border-white/10 text-white/60 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="text-white/40 text-[10px] uppercase tracking-wide text-right">
                <th className="text-left font-medium pb-2">Concurrent</th>
                <th className="font-medium pb-2 pr-3">Fiches</th>
                {FIELDS.map((f) => <th key={f.key} className="font-medium pb-2 px-1 min-w-[64px]">{f.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.siteId} className="border-t border-white/5 text-right">
                  <td className="text-left py-1.5 text-white/85 truncate max-w-[180px]" title={r.domain}>
                    {r.domain.replace(/^www\./, '')}
                  </td>
                  <td className="pr-3 text-white/55">{r.audit.indexed.toLocaleString('fr-FR')}</td>
                  {FIELDS.map((f) => {
                    const v = r.audit[f.key]
                    const s = cellStyle(v, r.audit.indexed)
                    return (
                      <td key={f.key} className={`px-1 text-center border-l border-white/[0.04] ${s.txt}`} style={{ backgroundColor: s.bg }}>
                        {r.audit.indexed === 0 ? '·' : `${v}%`}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-white/40 mt-4">
            <span className="text-rose-300">0 %</span> sur le prix alors que des fiches sont collectées = prix non publié (site pro/B2B)
            ou chargé en JavaScript. <span className="text-emerald-300">Vert</span> = champ bien parsé. « Fiches » = nombre de pages produit indexées pour ce concurrent.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
