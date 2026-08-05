// Explorateur des résultats de scraping, un onglet par concurrent. Vue de VALIDATION :
// mon produit F1 face à la fiche relevée, pour juger d'un coup d'œil si l'appariement
// désigne bien le même article.
//
// Ce que cet écran corrige : le tableau de bord lit un rapport pré-agrégé PLAFONNÉ à ~1 Mo
// (quelques centaines de produits sur des dizaines de milliers appariés). L'index de
// scraping, lui, est stocké page par page et n'a pas de plafond — c'est lui qu'on lit ici.
//
// Mise en page : trois étages FIXES (contexte → mesure → contrôle), puis la liste, seule
// à défiler. L'en-tête de colonnes reste collé en haut de cette zone — sur des milliers
// de lignes, perdre « qui est à gauche, qui est à droite » au premier scroll rendait la
// comparaison illisible.
import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, AlertTriangle, Loader2, Download, PanelLeftClose, ChevronsRight } from 'lucide-react'
import { useCompetitorMeta } from '../useCatalogReport'
import { useSourceCatalog, useSiteListings } from './useSiteExplorer'
import { buildTabs, ExplorerTabs } from './ExplorerTabs'
import { ExplorerSearch } from './ExplorerSearch'
import { ExplorerFilters, ExplorerTokens } from './ExplorerFilters'
import { ExplorerStats } from './ExplorerStats'
import { ExplorerPositionBar } from './ExplorerPositionBar'
import { ExplorerPager, PAGE_SIZES } from './ExplorerPager'
import { ExplorerRow } from './ExplorerRow'
import { ExplorerTaxonomyTree } from './ExplorerTaxonomyTree'
import { ExplorerSourceLink } from './ExplorerSourceLink'
import { pairSiteListings } from './pairing'
import { buildTokenIndex, filterRows, EMPTY_EXPLORER_FILTER, type ExplorerFilter } from './filters'
import { computeStats } from './stats'
import { rowsToCsv } from './exportCsv'
import { useSourceSheet } from './useSourceSheet'
import { useTranslation } from '@/lib/i18n'

const iconBtn = 'bg-well text-white/55 text-xs rounded px-2.5 py-2 border border-white/10 hover:text-white hover:border-white/25 disabled:opacity-40 disabled:hover:text-white/55 disabled:hover:border-white/10 flex items-center gap-1.5 transition-colors shrink-0'

export function CompetitorExplorer({ watchId }: { watchId: string | null }) {
  const { t } = useTranslation()
  const meta = useCompetitorMeta(watchId)
  const tabs = useMemo(() => buildTabs(meta), [meta])
  const [siteId, setSiteId] = useState<string | null>(null)
  const active = siteId && tabs.some((tab) => tab.siteId === siteId) ? siteId : (tabs.find((tab) => tab.productCount > 0)?.siteId ?? null)
  const domain = tabs.find((tab) => tab.siteId === active)?.domain ?? ''

  const source = useSourceCatalog(watchId)
  const { listings, loading, error, reload } = useSiteListings(watchId, active)
  const { sheet, sheets, sheetIndex, setSheetIndex, extras } = useSourceSheet()

  const [filter, setFilter] = useState<ExplorerFilter>(EMPTY_EXPLORER_FILTER)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0])
  const [taxoOpen, setTaxoOpen] = useState(true)
  const patch = (p: Partial<ExplorerFilter>) => { setFilter((f) => ({ ...f, ...p })); setPage(0) }

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
  // seulement » viderait l'écran et ferait croire à une collecte vide.
  const noSource = source.products.length === 0
  const effective = useMemo(
    () => (noSource ? { ...filter, pairing: 'all' as const } : filter),
    [filter, noSource],
  )
  // Deux passes : l'arbre se nourrit des lignes filtrées SANS la taxonomie (ses compteurs
  // suivent la recherche, mais choisir une famille ne doit pas amputer l'arbre lui-même),
  // la liste applique le filtre complet.
  const beforeTaxo = useMemo(() => filterRows(rows, { ...effective, path: [] }), [rows, effective])
  const filtered = useMemo(
    () => (effective.path.length === 0 ? beforeTaxo : filterRows(rows, effective)),
    [rows, effective, beforeTaxo],
  )
  const stats = useMemo(() => computeStats(filtered), [filtered])

  // Le nombre de pages rétrécit avec les filtres : rester sur la page 7 d'un résultat qui
  // n'en compte plus que 2 afficherait une liste vide sans rien expliquer.
  useEffect(() => { setPage(0) }, [active])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize)

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob(['﻿' + rowsToCsv(filtered, domain)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = `concurrent-${domain}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  if (!watchId) return <p className="text-sm text-white/40 py-8 text-center">{t('pwx.aucunSuiviDeVeille')}</p>

  return (
    <div className="h-full flex flex-col min-h-0" data-pw-section="explorer">
      {/* ── Étage 1 · contexte : quel concurrent ─────────────────────────────── */}
      <ExplorerTabs tabs={tabs} active={active} loading={loading} onPick={setSiteId} />

      {/* ── Étage 2 · mesure : où j'en suis face à lui ───────────────────────── */}
      <div className="flex items-center gap-5 px-3 py-2.5 bg-surface-2/60 border-b border-white/[0.06] flex-wrap">
        <ExplorerPositionBar stats={stats} active={effective.gap} onPick={(gap) => patch({ gap })} />
        <div className="h-8 w-px bg-white/10 hidden lg:block" />
        <ExplorerStats stats={stats} collected={listings.length} />
      </div>

      {/* ── Étage 3 · contrôle : chercher, filtrer, paginer ──────────────────── */}
      <div className="px-3 py-2 space-y-2 border-b border-white/10">
        <div className="flex items-center gap-2 flex-wrap">
          <ExplorerSearch rows={rows} tokenIndex={tokenIndex} value={filter.q}
            onChange={(q) => patch({ q })}
            onAddToken={(tk) => patch({ tokens: filter.tokens.includes(tk) ? filter.tokens : [...filter.tokens, tk] })} />
          <ExplorerFilters filter={effective} onChange={patch} />
          <div className="ml-auto flex items-center gap-2">
            <ExplorerPager total={filtered.length} page={safePage} pageSize={pageSize}
              onPage={setPage} onPageSize={setPageSize} />
            <button type="button" onClick={reload} disabled={loading} className={iconBtn} title={t('pwx.reload')}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button type="button" onClick={exportCsv} disabled={filtered.length === 0} className={iconBtn} title={t('pwx.exportCsv')}>
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <ExplorerTokens filter={effective} onChange={patch} tokenIndex={tokenIndex} />
        <div className="flex items-center gap-4 flex-wrap">
          <ExplorerSourceLink sheet={sheet} sheets={sheets} sheetIndex={sheetIndex} onPick={setSheetIndex} extras={extras} />
          {source.absent && (
            <p className="text-[11px] text-amber-400/80 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              {t('pwx.catalogueSourceAbsentLancez')}
            </p>
          )}
        </div>
      </div>

      {/* ── Taxonomie F1 + liste : seules zones qui défilent ─────────────────── */}
      <div className="flex-1 min-h-0 flex">
        {taxoOpen ? (
          <div className="w-60 shrink-0 border-r border-white/10 bg-surface-2/40 flex flex-col min-h-0">
            <button type="button" onClick={() => setTaxoOpen(false)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-white/35 hover:text-white/70 border-b border-white/[0.06]">
              <PanelLeftClose className="w-3.5 h-3.5" />{t('pwx.taxo.title')}
            </button>
            <ExplorerTaxonomyTree rows={beforeTaxo} selected={effective.path}
              onSelect={(path) => patch({ path })} levels={extras.taxoLabels} />
          </div>
        ) : (
          <button type="button" onClick={() => setTaxoOpen(true)} title={t('pwx.taxo.title')}
            className="w-8 shrink-0 border-r border-white/10 bg-surface-2/40 hover:bg-white/[0.04] hover:border-indigo-500/30 flex flex-col items-center gap-2 pt-3 transition-colors group">
            <ChevronsRight className="w-4 h-4 text-white/40 group-hover:text-indigo-400" />
            <span className="text-[10px] font-semibold tracking-wider text-white/30 group-hover:text-white/60 [writing-mode:vertical-rl] rotate-180">
              {t('pwx.taxo.title')}
            </span>
          </button>
        )}

        <div className="flex-1 min-w-0 overflow-auto">
          <div className="grid grid-cols-2 text-[10px] uppercase tracking-wider sticky top-0 z-20 bg-surface-2 border-b border-white/10 shadow-[0_1px_0_rgba(255,255,255,0.04)]">
            <div className="px-3 py-2 text-indigo-300/80 font-medium">{t('pwx.monProduitF1')}</div>
            <div className="px-3 py-2 border-l border-white/10 text-white/50 font-medium">
              {domain || t('pw.col.competitor')}
            </div>
          </div>

          {loading || source.loading ? (
            <div className="py-16 text-center text-white/40 text-sm flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />{t('pwx.lectureDesFichesCollectees')}
            </div>
          ) : error ? (
            <div className="py-16 text-center text-rose-300 text-sm">{error}</div>
          ) : visible.length === 0 ? (
            <div className="py-16 text-center text-white/40 text-sm">
              {rows.length === 0 ? t('pwx.aucuneFicheCollecteePour') : t('pwx.aucuneFicheNeCorrespond')}
            </div>
          ) : (
            visible.map((r) => <ExplorerRow key={r.key} row={r} />)
          )}
        </div>
      </div>
    </div>
  )
}
