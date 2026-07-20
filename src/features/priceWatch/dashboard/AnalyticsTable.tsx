// src/features/priceWatch/dashboard/AnalyticsTable.tsx
// Tableau analytique maître (terminal dense) : 1 produit / ligne, colonnes fixes + une
// heat-cell d'écart par concurrent. Triable (clic en-tête), filtrable (recherche /
// position / famille), exportable CSV. C'est le « où agir » + « explorer la donnée brute ».
import { useMemo, useState } from 'react'
import type { StoredReport } from '../reportStore'
import type { Cockpit, TableRow } from './analytics'
import { buildTableRows, rowsToCsv } from './analytics'
import { eur, pct, heatColor, POSITION_LABEL, POSITION_TEXT } from './format'

type SortKey = 'name' | 'famille' | 'myPriceHt' | 'bestGapPct'
const num = (v: number | null) => (v == null ? Number.POSITIVE_INFINITY : v)

export function AnalyticsTable({ report, ck }: { report: StoredReport; ck: Cockpit }) {
  const comps = ck.competitors
  const allRows = useMemo(() => buildTableRows(report.products), [report])
  const [q, setQ] = useState('')
  const [tone, setTone] = useState<'all' | 'cheaper' | 'aligned' | 'dearer'>('all')
  const [fam, setFam] = useState('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'bestGapPct', dir: 1 })

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let r = allRows.filter((x) => {
      if (tone !== 'all' && x.tone !== tone) return false
      if (fam !== 'all' && (x.famille ?? 'Autres') !== fam) return false
      if (needle && ![x.name, x.reference, x.ean].some((s) => s?.toLowerCase().includes(needle))) return false
      return true
    })
    const { key, dir } = sort
    r = [...r].sort((a, b) => {
      const av = a[key], bv = b[key]
      if (typeof av === 'string' || typeof bv === 'string') return dir * String(av ?? '').localeCompare(String(bv ?? ''))
      return dir * (num(av as number | null) - num(bv as number | null))
    })
    return r
  }, [allRows, q, tone, fam, sort])

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
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="text-sm font-semibold text-white mr-auto">Détail produits ({rows.length})</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher réf, EAN, nom…"
          className="bg-well text-white/80 text-xs rounded px-2 py-1.5 border border-white/10 w-48 focus:outline-none focus:border-white/25" />
        <select value={tone} onChange={(e) => setTone(e.target.value as typeof tone)}
          className="bg-well text-white/80 text-xs rounded px-2 py-1.5 border border-white/10">
          <option value="all">Toutes positions</option>
          <option value="cheaper">Concurrent moins cher</option>
          <option value="aligned">Aligné</option>
          <option value="dearer">Je suis moins cher</option>
        </select>
        <select value={fam} onChange={(e) => setFam(e.target.value)}
          className="bg-well text-white/80 text-xs rounded px-2 py-1.5 border border-white/10">
          <option value="all">Toutes familles</option>
          {ck.families.map((f) => <option key={f.famille} value={f.famille}>{f.famille}</option>)}
        </select>
        <button onClick={exportCsv}
          className="bg-well text-white/70 text-xs rounded px-3 py-1.5 border border-white/10 hover:text-white hover:border-white/25">
          Export CSV
        </button>
      </div>
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
                <th key={c.siteId} className="pb-2 font-medium px-1 min-w-[56px]" title={c.domain}>
                  <div className="max-w-[64px] truncate mx-auto">{c.domain.replace(/^www\./, '').split('.')[0]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r: TableRow) => (
              <tr key={r.id} className="border-t border-white/5 text-right hover:bg-white/[0.03]">
                <td className="text-left py-1.5 pl-3 text-white/85 max-w-[240px] truncate" title={r.name}>
                  {r.name}<span className="text-white/35"> · {r.reference ?? '—'}</span>
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
                  return (
                    <td key={c.siteId} className="px-1 text-center text-white/80 border-l border-white/[0.04]"
                      style={{ backgroundColor: g == null ? undefined : heatColor(g) }}
                      title={g == null ? '' : `${c.domain} : ${pct(g)} (${eur(r.priceBySite[c.siteId])})`}>
                      {g == null ? <span className="text-white/15">·</span> : `${g > 0 ? '+' : ''}${Math.round(g)}`}
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
