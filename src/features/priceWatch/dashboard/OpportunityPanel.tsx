// src/features/priceWatch/dashboard/OpportunityPanel.tsx
// Top opportunités : produits où je suis le plus cher, triés par écart UNITAIRE € (mon
// prix HT − meilleur prix concurrent HT — PAS un revenu : ni volume ni marge en données).
// Où baisser en priorité. Lit la vue filtrée (participe au cross-filter du cockpit).
import type { Cockpit } from './analytics'
import { eur, pct } from './format'

const TOP = 12

export function OpportunityPanel({ ck }: { ck: Cockpit }) {
  const rows = ck.opportunities.filter((o) => o.gapEur != null && o.gapEur > 0).slice(0, TOP)
  const maxEur = Math.max(1, ...rows.map((o) => o.gapEur ?? 0))

  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-sm font-semibold text-white">Top opportunités <span className="text-white/40 font-normal">— où baisser</span></div>
        <div className="text-[11px] text-white/35">écart unitaire €{ck.truncated ? ' · top 1000' : ''}</div>
      </div>
      {rows.length === 0 ? (
        <div className="text-white/40 text-sm py-8 text-center">Aucun produit où un concurrent est moins cher. Bon positionnement.</div>
      ) : (
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-white/40 text-[10px] uppercase tracking-wide text-right">
              <th className="text-left font-medium pb-2">Produit</th>
              <th className="font-medium pb-2">Mon prix</th>
              <th className="font-medium pb-2">Moins cher</th>
              <th className="font-medium pb-2">Écart</th>
              <th className="font-medium pb-2 w-[26%]">Impact €</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-t border-white/5 text-right">
                <td className="text-left py-1.5 text-white/85 max-w-[200px] truncate" title={o.name}>
                  {o.name}<span className="text-white/35"> · {o.reference ?? '—'}</span>
                </td>
                <td className="text-white/70">{eur(o.myPriceHt)}</td>
                <td className="text-white/55 whitespace-nowrap">
                  {eur(o.minPriceHt)}<span className="text-white/30"> {o.minDomain?.replace(/^www\./, '').split('.')[0] ?? ''}</span>
                </td>
                <td className="text-rose-400 font-medium">{pct(o.gapPct)}</td>
                <td className="pl-2">
                  <div className="flex items-center gap-2 justify-end">
                    <span className="text-rose-300 w-14">{eur(o.gapEur)}</span>
                    <div className="flex-1 max-w-[90px] h-2 rounded-sm bg-well overflow-hidden">
                      <div className="h-full bg-rose-400/70 rounded-sm" style={{ width: `${((o.gapEur ?? 0) / maxEur) * 100}%` }} />
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
