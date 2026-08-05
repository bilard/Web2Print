// Explorateur des résultats de scraping, un onglet par concurrent. Vue de VALIDATION :
// mon produit F1 face à la fiche relevée, pour juger d'un coup d'œil si l'appariement
// désigne bien le même article.
//
// Ce que cet écran corrige : le tableau de bord lit un rapport pré-agrégé PLAFONNÉ à ~1 Mo
// (quelques centaines de produits sur des dizaines de milliers appariés). L'index de
// scraping, lui, est stocké page par page et n'a pas de plafond — c'est lui qu'on lit ici.
import { useMemo, useState } from 'react'
import { RefreshCw, AlertTriangle, Loader2, Download } from 'lucide-react'
import { useCompetitorMeta } from '../useCatalogReport'
import { useSourceCatalog, useSiteListings } from './useSiteExplorer'
import { buildTabs, ExplorerTabs } from './ExplorerTabs'
import { ExplorerSearch } from './ExplorerSearch'
import { ExplorerFilters } from './ExplorerFilters'
import { ExplorerStats } from './ExplorerStats'
import { ExplorerRow } from './ExplorerRow'
import { ExplorerSourceLink } from './ExplorerSourceLink'
import { pairSiteListings } from './pairing'
import { buildTokenIndex, filterRows, EMPTY_EXPLORER_FILTER, type ExplorerFilter } from './filters'
import { computeStats } from './stats'
import { rowsToCsv } from './exportCsv'
import { useSourceSheet } from './useSourceSheet'
import { useTranslation, intlLocale } from '@/lib/i18n'

const PAGE = 40

export function CompetitorExplorer({ watchId }: { watchId: string | null }) {
  const { t, locale } = useTranslation()
  const meta = useCompetitorMeta(watchId)
  const tabs = useMemo(() => buildTabs(meta), [meta])
  const [siteId, setSiteId] = useState<string | null>(null)
  const active = siteId && tabs.some((tab) => tab.siteId === siteId) ? siteId : (tabs.find((tab) => tab.productCount > 0)?.siteId ?? null)
  const domain = tabs.find((tab) => tab.siteId === active)?.domain ?? ''

  const source = useSourceCatalog(watchId)
  const { listings, loading, error, reload } = useSiteListings(watchId, active)
  const { sheet, sheets, sheetIndex, setSheetIndex, extras } = useSourceSheet()

  const [filter, setFilter] = useState<ExplorerFilter>(EMPTY_EXPLORER_FILTER)
  const [shown, setShown] = useState(PAGE)
  const patch = (p: Partial<ExplorerFilter>) => { setFilter((f) => ({ ...f, ...p })); setShown(PAGE) }

  // Appariement + écarts : recalculés quand le site OU le catalogue change. Sur des
  // dizaines de milliers de produits l'opération est en O(produits) sur un index en
  // mémoire — quelques centaines de ms, une seule fois par onglet.
  const rows = useMemo(
    () => (active && listings.length > 0
      ? pairSiteListings(source.products, active, listings, { vatRate: source.vatRate, extras: extras.lookup })
      : []),
    [active, listings, source.products, source.vatRate, extras],
  )
  const tokenIndex = useMemo(() => buildTokenIndex(rows), [rows])
  // Sans catalogue source, TOUTES les fiches sont orphelines : garder le filtre « appariés
  // seulement » viderait l'écran et ferait croire à une collecte vide. On montre les fiches
  // relevées — le bandeau, lui, dit pourquoi la colonne de gauche manque.
  const noSource = source.products.length === 0
  const effective = useMemo(
    () => (noSource ? { ...filter, pairing: 'all' as const } : filter),
    [filter, noSource],
  )
  const filtered = useMemo(() => filterRows(rows, effective), [rows, effective])
  const stats = useMemo(() => computeStats(filtered), [filtered])

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob(['﻿' + rowsToCsv(filtered, domain)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = `concurrent-${domain}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  if (!watchId) return <p className="text-sm text-white/40 py-8 text-center">{t('pwx.aucunSuiviDeVeille')}</p>

  return (
    <div className="space-y-3" data-pw-section="explorer">
      <ExplorerTabs tabs={tabs} active={active} loading={loading} onPick={(id) => { setSiteId(id); setShown(PAGE) }} />

      {source.absent && (
        <p className="text-xs text-amber-400/80 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {t('pwx.catalogueSourceAbsentLancez')}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <ExplorerSearch rows={rows} tokenIndex={tokenIndex} value={filter.q}
          onChange={(q) => patch({ q })}
          onAddToken={(tk) => patch({ tokens: filter.tokens.includes(tk) ? filter.tokens : [...filter.tokens, tk] })} />
        <button type="button" onClick={reload} disabled={loading}
          className="bg-well text-white/60 text-xs rounded px-2.5 py-2 border border-white/10 hover:text-white hover:border-white/25 disabled:opacity-40 flex items-center gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />{t('pwx.reload')}
        </button>
        <button type="button" onClick={exportCsv} disabled={filtered.length === 0}
          className="bg-well text-white/60 text-xs rounded px-2.5 py-2 border border-white/10 hover:text-white hover:border-white/25 disabled:opacity-40 flex items-center gap-1.5">
          <Download className="w-3.5 h-3.5" />{t('pwx.exportCsv')}
        </button>
      </div>

      <ExplorerFilters filter={effective} onChange={patch} tokenIndex={tokenIndex} />
      <ExplorerSourceLink sheet={sheet} sheets={sheets} sheetIndex={sheetIndex} onPick={setSheetIndex} extras={extras} />
      <ExplorerStats stats={stats} collected={listings.length} />

      <div className="bg-surface rounded-lg border border-white/5 overflow-hidden">
        <div className="grid grid-cols-2 text-[10px] uppercase tracking-wide text-white/35 bg-surface-2 sticky top-0 z-10">
          <div className="px-2.5 py-1.5">{t('pwx.monProduitF1')}</div>
          <div className="px-2.5 py-1.5 border-l border-white/10">{domain || t('pw.col.competitor')}</div>
        </div>

        {loading || source.loading ? (
          <div className="py-12 text-center text-white/40 text-sm flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />{t('pwx.lectureDesFichesCollectees')}
          </div>
        ) : error ? (
          <div className="py-12 text-center text-rose-300 text-sm">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-white/40 text-sm">
            {rows.length === 0 ? t('pwx.aucuneFicheCollecteePour') : t('pwx.aucuneFicheNeCorrespond')}
          </div>
        ) : (
          filtered.slice(0, shown).map((r) => <ExplorerRow key={r.key} row={r} domain={domain} />)
        )}
      </div>

      {shown < filtered.length && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)}
          className="w-full text-xs text-white/60 hover:text-white bg-surface hover:bg-surface-2 rounded-lg py-2 transition-colors">
          {t('pwx.showMore', {
            count: Math.min(PAGE, filtered.length - shown).toLocaleString(intlLocale(locale)),
            total: filtered.length.toLocaleString(intlLocale(locale)),
          })}
        </button>
      )}
    </div>
  )
}
