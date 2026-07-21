// src/features/priceWatch/dashboard/CompetitorAuditModal.tsx
// Popup d'audit de la collecte par concurrent : sur les fiches COLLECTÉES (indexées),
// quel % porte chaque champ attendu (prix, prix barré, stock, nom, image, réf).
// Rend visible « rien collecté » vs « champ manquant » vs « scrape complet », pour
// distinguer un vrai trou de parsing d'un site qui ne publie pas la donnée.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, Check, EuroIcon, Ban } from 'lucide-react'
import type { CompetitorStat, CompetitorAudit } from '../catalog/report'
import { probeCompetitor, type ProbeResult } from '../catalog/probe'
import { fetchSourceHtml } from '@/features/scraping-templates/fetchSourceHtml'

type ProbeState = { loading: boolean; result?: ProbeResult }

const VERDICT: Record<ProbeResult['verdict'], { label: string; cls: string; Icon: typeof Check }> = {
  ok: { label: 'Éligible', cls: 'text-emerald-300', Icon: Check },
  'no-price': { label: 'Pas de prix', cls: 'text-rose-300', Icon: EuroIcon },
  blocked: { label: 'Bloqué', cls: 'text-white/40', Icon: Ban },
}

const FIELDS: { key: Exclude<keyof CompetitorAudit, 'indexed'>; label: string }[] = [
  { key: 'pctPrice', label: 'Prix' },
  { key: 'pctListPrice', label: 'Prix barré' },
  { key: 'pctStock', label: 'Stock' },
  { key: 'pctName', label: 'Nom' },
  { key: 'pctImage', label: 'Image' },
  { key: 'pctRef', label: 'Réf' },
]

/** Durée lisible : « 12 s », « 3 min », « 1 h 20 ». '·' si non mesuré. */
function fmtDuration(ms?: number): string {
  if (ms == null) return '·'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

/** Fond de cellule selon le taux : rose (0 / faible) → ambre → émeraude. */
function cellStyle(pct: number, indexed: number): { bg: string; txt: string } {
  if (indexed === 0) return { bg: 'transparent', txt: 'text-white/25' }
  if (pct === 0) return { bg: 'rgba(244,63,94,0.20)', txt: 'text-rose-300' }
  if (pct < 40) return { bg: 'rgba(251,146,60,0.16)', txt: 'text-amber-300' }
  if (pct < 80) return { bg: 'rgba(251,191,36,0.12)', txt: 'text-amber-200' }
  return { bg: 'rgba(52,211,153,0.14)', txt: 'text-emerald-300' }
}

export function CompetitorAuditModal({ stats, onClose }: { stats: CompetitorStat[]; onClose: () => void }) {
  const [probes, setProbes] = useState<Record<string, ProbeState>>({})
  const [probingAll, setProbingAll] = useState(false)

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

  // Sonde d'éligibilité : scrape témoin (quelques pages) via la même couche que la
  // moisson, SANS persister — pour décider AVANT de lancer la collecte complète.
  const runProbe = async (siteId: string, domain: string) => {
    setProbes((p) => ({ ...p, [siteId]: { loading: true } }))
    try {
      const result = await probeCompetitor({ siteId, domain, families: [] }, { fetchHtml: (url) => fetchSourceHtml(url) })
      setProbes((p) => ({ ...p, [siteId]: { loading: false, result } }))
    } catch {
      setProbes((p) => ({ ...p, [siteId]: { loading: false, result: { audit: EMPTY, categoriesFound: 0, verdict: 'blocked' } } }))
    }
  }
  const probeAll = async () => {
    setProbingAll(true)
    for (const r of rows) await runProbe(r.siteId, r.domain)
    setProbingAll(false)
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8" onClick={onClose}>
      <div className="w-full max-w-4xl bg-surface rounded-lg border border-white/10 relative max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-background px-5 py-4 border-b border-white/10 relative flex items-center">
          <div className="flex-1 text-center px-24">
            <h2 className="text-base font-semibold text-white">Audit de la collecte par concurrent</h2>
            <span className="text-[11px] text-white/40">% des fiches collectées portant chaque champ</span>
          </div>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <button type="button" onClick={() => void probeAll()} disabled={probingAll}
              title="Teste chaque concurrent sur quelques pages témoins, sans lancer la moisson complète"
              className="text-[11px] text-indigo-300 hover:text-indigo-200 border border-indigo-400/30 rounded px-2 py-1 disabled:opacity-50 whitespace-nowrap">
              {probingAll ? 'Sonde en cours…' : 'Tout sonder (test)'}
            </button>
            <button type="button" onClick={onClose} title="Fermer (Échap)"
              className="p-1.5 rounded bg-well border border-white/10 text-white/60 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="p-5">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="text-white/40 text-[10px] uppercase tracking-wide text-right">
                <th className="text-left font-medium pb-2">Concurrent</th>
                <th className="font-medium pb-2 pr-3">Fiches</th>
                <th className="font-medium pb-2 px-2 whitespace-nowrap" title="Durée de la dernière passe de moisson">Dern.</th>
                <th className="font-medium pb-2 px-2 pr-3 whitespace-nowrap" title="Cumul du temps de moisson (calibrage du cron)">Cumul</th>
                {FIELDS.map((f) => <th key={f.key} className="font-medium pb-2 px-1 min-w-[64px]">{f.label}</th>)}
                <th className="font-medium pb-2 px-2 pl-3 text-center border-l border-white/[0.06] min-w-[92px]" title="Test avant scraping : quelques pages témoins">Sonde</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.siteId} className="border-t border-white/5 text-right">
                  <td className="text-left py-1.5 text-white/85 truncate max-w-[180px]" title={r.domain}>
                    {r.domain.replace(/^www\./, '')}
                  </td>
                  <td className="pr-3 text-white/55">{r.audit.indexed.toLocaleString('fr-FR')}</td>
                  <td className="px-2 text-white/45 whitespace-nowrap">{fmtDuration(r.harvest?.lastMs)}</td>
                  <td className="px-2 pr-3 text-white/45 whitespace-nowrap">{fmtDuration(r.harvest?.cumulMs)}</td>
                  {FIELDS.map((f) => {
                    const v = r.audit[f.key]
                    const s = cellStyle(v, r.audit.indexed)
                    return (
                      <td key={f.key} className={`px-1 text-center border-l border-white/[0.04] ${s.txt}`} style={{ backgroundColor: s.bg }}>
                        {r.audit.indexed === 0 ? '·' : `${v}%`}
                      </td>
                    )
                  })}
                  <td className="px-2 pl-3 text-center border-l border-white/[0.06] whitespace-nowrap">
                    {(() => {
                      const st = probes[r.siteId]
                      if (!st) return (
                        <button type="button" onClick={() => void runProbe(r.siteId, r.domain)}
                          className="text-[11px] text-indigo-300 hover:text-indigo-200 border border-indigo-400/30 rounded px-2 py-0.5">Sonder</button>
                      )
                      if (st.loading || !st.result) return <Loader2 className="w-3.5 h-3.5 animate-spin inline text-white/50" />
                      const v = VERDICT[st.result.verdict]
                      const Icon = v.Icon
                      return (
                        <span className={`inline-flex items-center gap-1 ${v.cls}`}
                          title={`Échantillon témoin : ${st.result.audit.indexed} fiche(s) · prix ${st.result.audit.pctPrice}% · ${st.result.categoriesFound} catégorie(s) trouvée(s)`}>
                          <Icon className="w-3.5 h-3.5" />{v.label}
                        </span>
                      )
                    })()}
                  </td>
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
