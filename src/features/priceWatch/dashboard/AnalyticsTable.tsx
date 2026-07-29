// Tableau analytique maître (terminal dense), GROUPÉ PAR FAMILLE : familles en ordre
// alphabétique (en-tête de groupe FIXE au scroll horizontal), produits triés par nom
// dans chaque groupe (ou par la colonne cliquée). Heat-cell d'écart par concurrent,
// export CSV. Le FILTRE est global (recherche du cockpit) → lignes déjà filtrées.
import { useMemo, useState } from 'react'
import type { Cockpit, TableRow } from './analytics'
import { rowsToCsv, groupRowsByFamily } from './analytics'
import { eur, pct, heatColor, POSITION_LABEL, POSITION_TEXT } from './format'
import { Search, ChevronDown, ChevronRight } from 'lucide-react'
import type { ProductRow } from '../catalog/report'
import { SearchAutocomplete } from './SearchAutocomplete'
import { useTranslation } from '@/lib/i18n'

const googleSearch = (r: TableRow) =>
  `https://www.google.com/search?q=${encodeURIComponent(`${r.reference ?? ''} ${r.name}`.trim())}`

type SortKey = 'name' | 'myPriceHt' | 'bestGapPct'
const num = (v: number | null) => (v == null ? Number.POSITIVE_INFINITY : v)

export function AnalyticsTable({ ck, searchQ, onSearch, onPickFamily, products }: {
  ck: Cockpit
  /** Recherche GLOBALE du cockpit, exposée aussi ici (demande : champ visible sur le tableau). */
  searchQ: string
  onSearch: (q: string) => void
  onPickFamily: (famille: string) => void
  products: ProductRow[]
}) {
  const { t } = useTranslation()
  // On n'affiche que les concurrents qui ont AU MOINS un produit apparié : les sites à 0
  // (n'ont pas ce catalogue) n'ajoutaient que des colonnes vides. Le Benchmark garde la
  // vue exhaustive des 19 sites ; ici on densifie.
  const comps = ck.competitors.filter((c) => c.matched > 0)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 })
  // TREEVIEW en ACCORDÉON : tout FERMÉ par défaut, un seul nœud famille ouvert à la
  // fois (ouvrir un nœud ferme l'autre). Une recherche/un filtre actif déplie tout —
  // les résultats doivent être visibles sans rouvrir les familles une à une.
  const [openFam, setOpenFam] = useState<string | null>(null)
  const isOpen = (fam: string) => ck.filterActive || openFam === fam
  const toggleFam = (fam: string) => setOpenFam((prev) => (prev === fam ? null : fam))

  // Tri DANS chaque groupe (les familles, elles, restent alphabétiques).
  const groups = useMemo(() => {
    const { key, dir } = sort
    const sorted = [...ck.tableRows].sort((a, b) => {
      const av = a[key], bv = b[key]
      if (typeof av === 'string' || typeof bv === 'string') return dir * String(av ?? '').localeCompare(String(bv ?? ''), 'fr')
      return dir * (num(av as number | null) - num(bv as number | null))
    })
    return groupRowsByFamily(sorted)
  }, [ck.tableRows, sort])
  const rowCount = groups.reduce((n, g) => n + g.rows.length, 0)

  const exportCsv = () => {
    const csv = rowsToCsv(groups.flatMap((g) => g.rows), comps)
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
        <div className="text-sm font-semibold text-white">{t('pw.table.title')}</div>
        <span className="text-[11px] text-white/40">{rowCount}{ck.filterActive ? ` / ${ck.totalCount}` : ''}</span>
        <div className="ml-auto flex-1 max-w-md bg-well rounded px-3 py-1.5 border border-white/10">
          <SearchAutocomplete value={searchQ} onChange={onSearch} onPickFamily={onPickFamily} products={products} />
        </div>
        <button onClick={exportCsv} className="bg-well text-white/70 text-xs rounded px-3 py-1.5 border border-white/10 hover:text-white hover:border-white/25">
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
              {th('myPriceHt', 'Mon prix HT', 'pr-2')}
              {th('bestGapPct', t('pw.table.bestGap'), 'pr-2')}
              <th className="pb-2 font-medium pr-2">{t('pw.table.position')}</th>
              {comps.map((c) => (
                <th key={c.siteId} className="pb-2 font-medium px-1 min-w-[68px]" title={c.domain}>
                  <div className="max-w-[64px] truncate mx-auto">{c.domain.replace(/^www\./, '').split('.')[0]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowCount === 0 ? (
              <tr><td colSpan={4 + comps.length} className="text-center text-white/40 py-8">{t('pw.table.empty')}</td></tr>
            ) : groups.map((g) => [
              // Nœud famille de la treeview : repliable au clic, libellé FIXE au scroll
              // horizontal (sticky left dans une cellule pleine largeur).
              <tr key={`fam:${g.famille}`} onClick={() => toggleFam(g.famille)}
                className="border-t border-white/10 bg-surface-2/90 cursor-pointer select-none hover:bg-surface-2">
                <td colSpan={4 + comps.length} className="py-1.5">
                  <div className="sticky left-0 w-max flex items-center gap-2 pl-2 pr-4">
                    {isOpen(g.famille)
                      ? <ChevronDown className="w-3.5 h-3.5 text-amber-300/70" />
                      : <ChevronRight className="w-3.5 h-3.5 text-amber-300/70" />}
                    <span className="text-[10px] uppercase tracking-wide font-semibold text-amber-300/90">{g.famille}</span>
                    <span className="text-[10px] text-white/35 tabular-nums">{g.rows.length}</span>
                  </div>
                </td>
              </tr>,
              ...(isOpen(g.famille) ? g.rows : []).map((r: TableRow) => (
              <tr key={r.id} className="border-t border-white/5 text-right hover:bg-white/[0.03]">
                {/* Nom COMPLET du produit (demande : plus de troncature) — la colonne
                    s'élargit et le libellé passe sur plusieurs lignes si nécessaire. */}
                <td className="text-left py-1.5 pl-6 pr-2 min-w-[280px] max-w-[420px]">
                  <div className="flex items-start gap-1.5">
                    {r.sourceUrl
                      ? <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" title={t('pw.table.openSource')}
                          className="whitespace-normal break-words leading-snug text-white/85 hover:text-indigo-300 hover:underline">
                          {r.name}<span className="text-white/35"> · {r.reference ?? '—'}</span>
                        </a>
                      : <span className="whitespace-normal break-words leading-snug text-white/85">
                          {r.name}<span className="text-white/35"> · {r.reference ?? '—'}</span>
                        </span>}
                    <a href={googleSearch(r)} target="_blank" rel="noopener noreferrer" title={t('pw.table.googleSearch')}
                      className="shrink-0 text-white/25 hover:text-white/70" onClick={(e) => e.stopPropagation()}>
                      <Search className="w-3 h-3" />
                    </a>
                  </div>
                </td>
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
              )),
            ])}
          </tbody>
        </table>
      </div>
    </div>
  )
}
