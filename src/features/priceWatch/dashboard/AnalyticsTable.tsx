// src/features/priceWatch/dashboard/AnalyticsTable.tsx
// Tableau analytique maître (terminal dense) : 1 produit / ligne, colonnes fixes + une
// heat-cell d'écart par concurrent. Triable (clic en-tête), exportable CSV. Le FILTRE
// est global (piloté par la recherche du cockpit) → les lignes arrivent déjà filtrées.
import { useMemo, useState } from 'react'
import type { Cockpit, TableRow } from './analytics'
import { rowsToCsv } from './analytics'
import { eur, pct, heatColor, POSITION_LABEL, POSITION_TEXT } from './format'
import { Search } from 'lucide-react'

const googleSearch = (r: TableRow) =>
  `https://www.google.com/search?q=${encodeURIComponent(`${r.reference ?? ''} ${r.name}`.trim())}`

type SortKey = 'name' | 'famille' | 'myPriceHt' | 'bestGapPct'
const num = (v: number | null) => (v == null ? Number.POSITIVE_INFINITY : v)

export function AnalyticsTable({ ck }: { ck: Cockpit }) {
  // On n'affiche que les concurrents qui ont AU MOINS un produit apparié : les sites à 0
  // (n'ont pas ce catalogue) n'ajoutaient que des colonnes vides. Le Benchmark garde la
  // vue exhaustive des 19 sites ; ici on densifie.
  const comps = ck.competitors.filter((c) => c.matched > 0)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'bestGapPct', dir: 1 })

  const rows = useMemo(() => {
    const { key, dir } = sort
    return [...ck.tableRows].sort((a, b) => {
      const av = a[key], bv = b[key]
      if (typeof av === 'string' || typeof bv === 'string') return dir * String(av ?? '').localeCompare(String(bv ?? ''))
      return dir * (num(av as number | null) - num(bv as number | null))
    })
  }, [ck.tableRows, sort])

  const exportCsv = () => {
    const csv = rowsToCsv(rows, comps)
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = `veille-${ck.runAt}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const th = (key: SortKey, label: string, cls = '') => (
    <th className={`pb-2 font-medium cursor-pointer select-none hover:text-white/80 ${cls}`}
      onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
      {label}{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  )

  return (
    <div className="bg-surface rounded-lg p-4" data-pw-section="table">
      <div className="flex items-center gap-2 mb-1">
        <div className="text-sm font-semibold text-white">Détail produits</div>
        <span className="text-[11px] text-white/40">{rows.length}{ck.filterActive ? ` / ${ck.totalCount}` : ''}</span>
        <button onClick={exportCsv} className="ml-auto bg-well text-white/70 text-xs rounded px-3 py-1.5 border border-white/10 hover:text-white hover:border-white/25">
          Export CSV
        </button>
      </div>
      <p className="text-[11px] text-white/40 mb-3">
        Prix concurrents en <span className="text-white/70">HT</span>, convertis du TTC affiché sur leurs sites (÷ TVA) — comparables à vos prix F1 déjà HT.
        Survolez une cellule pour voir le TTC d’origine.
      </p>
      <div className="overflow-auto max-h-[520px] rounded border border-white/5">
        <table className="w-full text-xs tabular-nums">
          <thead className="sticky top-0 bg-surface-2 z-10 text-white/40 text-[10px] uppercase tracking-wide">
            <tr className="text-right">
              {th('name', 'Produit', 'text-left pl-3')}
              {th('famille', 'Famille', 'text-left')}
              {th('myPriceHt', 'Mon prix HT', 'pr-2')}
              {th('bestGapPct', 'Meilleur écart', 'pr-2')}
              <th className="pb-2 font-medium pr-2">Position</th>
              {comps.map((c) => (
                <th key={c.siteId} className="pb-2 font-medium px-1 min-w-[68px]" title={c.domain}>
                  <div className="max-w-[64px] truncate mx-auto">{c.domain.replace(/^www\./, '').split('.')[0]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5 + comps.length} className="text-center text-white/40 py-8">Aucun produit ne correspond à la recherche.</td></tr>
            ) : rows.map((r: TableRow) => (
              <tr key={r.id} className="border-t border-white/5 text-right hover:bg-white/[0.03]">
                <td className="text-left py-1.5 pl-3 max-w-[240px]">
                  <div className="flex items-center gap-1.5">
                    {r.sourceUrl
                      ? <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" title={`Ouvrir la fiche source — ${r.name}`}
                          className="truncate text-white/85 hover:text-indigo-300 hover:underline">
                          {r.name}<span className="text-white/35"> · {r.reference ?? '—'}</span>
                        </a>
                      : <span className="truncate text-white/85" title={r.name}>
                          {r.name}<span className="text-white/35"> · {r.reference ?? '—'}</span>
                        </span>}
                    <a href={googleSearch(r)} target="_blank" rel="noopener noreferrer" title="Rechercher ce produit sur Google"
                      className="shrink-0 text-white/25 hover:text-white/70" onClick={(e) => e.stopPropagation()}>
                      <Search className="w-3 h-3" />
                    </a>
                  </div>
                </td>
                <td className="text-left text-white/45 max-w-[120px] truncate">{r.famille ?? '—'}</td>
                <td className="pr-2 text-white/80">{eur(r.myPriceHt)}</td>
                <td className={`pr-2 font-medium ${r.tone ? POSITION_TEXT[r.tone] : 'text-white/40'}`}>{pct(r.bestGapPct)}</td>
                <td className="pr-2">
                  {r.tone
                    ? <span className={`text-[10px] ${POSITION_TEXT[r.tone]}`}>{POSITION_LABEL[r.tone].split(' ')[0]}</span>
                    : <span className="text-white/30">—</span>}
                </td>
                {comps.map((c) => {
                  const g = r.gapBySite[c.siteId]
                  const price = r.priceBySite[c.siteId]
                  const ttc = r.ttcBySite[c.siteId]
                  const url = r.urlBySite[c.siteId]
                  return (
                    <td key={c.siteId} className="px-1 text-center border-l border-white/[0.04] whitespace-nowrap"
                      style={{ backgroundColor: g == null ? undefined : heatColor(g) }}
                      title={price == null ? '' : `${c.domain} · ${eur(price)} HT${ttc != null ? ` (${eur(ttc)} TTC affiché sur le site)` : ''}${g == null ? '' : ` · écart ${pct(g)}`}${url ? ' · clic : ouvrir la fiche' : ''}`}>
                      {price == null
                        ? <span className="text-white/15">·</span>
                        : url
                          ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-white/90 hover:text-[#fff] hover:underline">{Math.round(price)} €</a>
                          : <span className="text-white/85">{Math.round(price)} €</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
