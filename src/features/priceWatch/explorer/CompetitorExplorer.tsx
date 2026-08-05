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
import { RefreshCw, Loader2, Download, PanelLeftClose, ChevronsRight } from 'lucide-react'
import { useCompetitorMeta, useCatalogReport } from '../useCatalogReport'
import { useSourceCatalog, useSiteListings } from './useSiteExplorer'
import { buildRail, ExplorerSiteRail } from './ExplorerSiteRail'
import { ExplorerSearch } from './ExplorerSearch'
import { ExplorerFilters, ExplorerTokens } from './ExplorerFilters'
import { ExplorerStats } from './ExplorerStats'
import { ExplorerPositionBar } from './ExplorerPositionBar'
import { ExplorerPager, PAGE_SIZES } from './ExplorerPager'
import { ExplorerRow } from './ExplorerRow'
import { ExplorerTaxonomyTree } from './ExplorerTaxonomyTree'
import { ExplorerSourceSettings } from './ExplorerSourceSettings'
import { pairSiteListings } from './pairing'
import { buildTokenIndex, filterRows, EMPTY_EXPLORER_FILTER, type ExplorerFilter } from './filters'
import { computeStats } from './stats'
import { rowsToCsv } from './exportCsv'
import { useSourceSheet } from './useSourceSheet'
import { useVerdicts } from './useVerdicts'
import { useTranslation } from '@/lib/i18n'

const iconBtn = 'bg-well text-white/55 text-xs rounded px-2.5 py-2 border border-white/10 hover:text-white hover:border-white/25 disabled:opacity-40 disabled:hover:text-white/55 disabled:hover:border-white/10 flex items-center gap-1.5 transition-colors shrink-0'

export function CompetitorExplorer({ watchId, workflowId }: { watchId: string | null; workflowId?: string }) {
  const { t } = useTranslation()
  const meta = useCompetitorMeta(watchId)
  // Rapport agrégé : il porte l'appariement et l'écart médian PAR SITE, calculés avant
  // tout plafond d'affichage. C'est ce qui permet de mesurer les 19 concurrents sans en
  // charger un seul.
  const report = useCatalogReport(watchId)
  const sites = useMemo(() => buildRail(meta, report?.byCompetitor ?? []), [meta, report])
  const [siteId, setSiteId] = useState<string | null>(null)
  const active = siteId && sites.some((s) => s.siteId === siteId) ? siteId : (sites.find((s) => s.collected > 0)?.siteId ?? null)
  const domain = sites.find((s) => s.siteId === active)?.domain ?? ''

  const source = useSourceCatalog(watchId)
  const { listings, loading, error, reload } = useSiteListings(watchId, active)
  const src = useSourceSheet()
  const { extras } = src
  // Jugements d'audit du concurrent affiché : ils survivent à la session.
  const verdicts = useVerdicts(watchId, active)

  const [filter, setFilter] = useState<ExplorerFilter>(EMPTY_EXPLORER_FILTER)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0])
  const [taxoOpen, setTaxoOpen] = useState(true)
  const [railOpen, setRailOpen] = useState(true)
  const patch = (p: Partial<ExplorerFilter>) => { setFilter((f) => ({ ...f, ...p })); setPage(0) }

  // Appariement + écarts : recalculés quand le site OU le catalogue change. Sur des
  // dizaines de milliers de produits l'opération est en O(produits) sur un index en
  // mémoire — quelques centaines de ms, une seule fois par onglet.
  const rows = useMemo(
    () => (active && listings.length > 0
      ? pairSiteListings(source.products, active, listings, {
          vatRate: source.vatRate, extras: extras.lookup,
          imagePrefix: src.imagePrefix, productUrl: src.productUrl,
        })
      : []),
    [active, listings, source.products, source.vatRate, extras, src.imagePrefix, src.productUrl],
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
  const beforeTaxo = useMemo(() => filterRows(rows, { ...effective, path: [] }, verdicts.of), [rows, effective, verdicts.of])
  const filtered = useMemo(
    () => (effective.path.length === 0 ? beforeTaxo : filterRows(rows, effective, verdicts.of)),
    [rows, effective, beforeTaxo, verdicts.of],
  )
  const stats = useMemo(() => computeStats(filtered), [filtered])
  // Répartition des bandes sur TOUT le site, pas sur les lignes filtrées : elle sert à
  // expliquer une liste vidée par le filtre de fiabilité.
  const bands = useMemo(() => {
    let sure = 0, check = 0, doubt = 0
    for (const r of rows) {
      if (r.confidence?.band === 'sure') sure++
      else if (r.confidence?.band === 'check') check++
      else if (r.confidence?.band === 'doubt') doubt++
    }
    return { sure, check, doubt }
  }, [rows])

  // Ce que le catalogue source porte vraiment : dit d'un coup d'œil s'il faut relancer
  // « Comparer catalogue » pour obtenir taxonomie et visuels.
  const facts = useMemo(() => ({
    products: source.products.length,
    withImage: source.products.filter((p) => p.image).length,
    withTaxo: source.products.filter((p) => p.taxo?.length).length,
    withDescription: source.products.filter((p) => p.description).length,
    workflowId,
    partial: source.partial,
    expected: source.expected,
    sourceRows: source.sourceRows,
  }), [source.products, source.partial, source.expected, source.sourceRows, workflowId])

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
      {/* ── Étage 1 · mesure : où j'en suis face à lui ───────────────────────── */}
      <div className="flex items-center gap-5 px-3 py-2.5 bg-surface-2/60 border-b border-white/[0.06] flex-wrap">
        <ExplorerPositionBar stats={stats} active={effective.gap} onPick={(gap) => patch({ gap })} />
        <div className="h-8 w-px bg-white/10 hidden lg:block" />
        <ExplorerStats stats={stats} collected={listings.length}
          promoOnly={effective.promoOnly} outOfStockOnly={effective.stock === 'out-of-stock'}
          suspectsOnly={effective.trust === 'suspect'}
          onTogglePromo={() => patch({ promoOnly: !effective.promoOnly })}
          onToggleStock={() => patch({ stock: effective.stock === 'out-of-stock' ? 'all' : 'out-of-stock' })}
          onToggleSuspects={() => patch({ trust: effective.trust === 'suspect' ? 'all' : 'suspect' })} />
      </div>

      {/* ── Étage 2 · contrôle : chercher, filtrer, paginer ──────────────────── */}
      <div className="px-3 py-2 space-y-2 border-b border-white/10">
        <div className="flex items-center gap-2 flex-wrap">
          <ExplorerSearch rows={rows} tokenIndex={tokenIndex} value={filter.q}
            onChange={(q) => patch({ q })}
            onAddToken={(tk) => patch({ tokens: filter.tokens.includes(tk) ? filter.tokens : [...filter.tokens, tk] })} />
          <ExplorerFilters filter={effective} onChange={patch} />
          <div className="ml-auto flex items-center gap-2">
            {/* Avancement de l'audit : le seul chiffre qui mesure le TRAVAIL fait, pas
                l'état des données. Sa place est près des contrôles qui le produisent. */}
            {(verdicts.counts.ok > 0 || verdicts.counts.ko > 0) && (
              <span className="text-[10px] text-white/30 tabular-nums whitespace-nowrap">
                {t('pwx.verdict.done', verdicts.counts)}
              </span>
            )}
            <ExplorerPager total={filtered.length} page={safePage} pageSize={pageSize}
              onPage={setPage} onPageSize={setPageSize} />
            <button type="button" onClick={reload} disabled={loading} className={iconBtn} title={t('pwx.reload')}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button type="button" onClick={exportCsv} disabled={filtered.length === 0} className={iconBtn} title={t('pwx.exportCsv')}>
              <Download className="w-3.5 h-3.5" />
            </button>
            <ExplorerSourceSettings facts={facts} databases={src.databases} dbId={src.dbId} onPickDb={src.setDbId}
              loading={src.loading} sheets={src.sheets} sheetIndex={src.sheetIndex}
              onPickSheet={src.setSheetIndex} extras={extras} absent={source.absent}
              imagePrefix={src.imagePrefix} onImagePrefix={src.setImagePrefix}
              productUrl={src.productUrl} onProductUrl={src.setProductUrl} />
          </div>
        </div>
        <ExplorerTokens filter={effective} onChange={patch} tokenIndex={tokenIndex} />
      </div>

      {/* ── Concurrents · taxonomie F1 · liste : seules zones qui défilent ──── */}
      <div className="flex-1 min-h-0 flex">
        {railOpen ? (
          <div className="w-56 shrink-0 border-r border-white/10 bg-surface-2/60 flex flex-col min-h-0">
            <button type="button" onClick={() => setRailOpen(false)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-white/35 hover:text-white/70 border-b border-white/[0.06]">
              <PanelLeftClose className="w-3.5 h-3.5" />{t('pwx.competitors')}
              <span className="ml-auto tabular-nums text-white/20">{sites.length}</span>
            </button>
            <div className="flex-1 min-h-0">
              <ExplorerSiteRail items={sites} active={active} loading={loading} onPick={setSiteId} />
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setRailOpen(true)} title={t('pwx.competitors')}
            className="w-8 shrink-0 border-r border-white/10 bg-surface-2/60 hover:bg-white/[0.04] hover:border-indigo-500/30 flex flex-col items-center gap-2 pt-3 transition-colors group">
            <ChevronsRight className="w-4 h-4 text-white/40 group-hover:text-indigo-400" />
            <span className="text-[10px] font-semibold tracking-wider text-white/30 group-hover:text-white/60 [writing-mode:vertical-rl] rotate-180">
              {t('pwx.competitors')}
            </span>
          </button>
        )}

        {taxoOpen ? (
          <div className="w-60 shrink-0 border-r border-white/10 bg-surface-2/40 flex flex-col min-h-0">
            <button type="button" onClick={() => setTaxoOpen(false)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-white/35 hover:text-white/70 border-b border-white/[0.06]">
              <PanelLeftClose className="w-3.5 h-3.5" />{t('pwx.taxo.title')}
            </button>
            <ExplorerTaxonomyTree rows={beforeTaxo} selected={effective.path}
              onSelect={(path) => patch({ path })} levels={extras.taxoLabels}
              diag={{
                db: src.databases.find((d) => d.docId === src.dbId)?.label ?? t('pwx.db.open'),
                joined: extras.size,
                taxoCols: extras.taxoKeys.filter((k): k is string => !!k),
              }} />
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
            <div className="py-16 text-center text-white/40 text-sm space-y-2">
              <p>{rows.length === 0 ? t('pwx.aucuneFicheCollecteePour') : t('pwx.aucuneFicheNeCorrespond')}</p>
              {/* Une liste vide qui se tait se lit comme une panne. Quand un filtre de
                  fiabilité l'a vidée, on dit ce que le site contient RÉELLEMENT : sur un
                  marchand sans données structurées, « sûrs seulement » peut légitimement
                  ne rien rendre. */}
              {rows.length > 0 && effective.trust !== 'all' && (
                <p className="text-[11px] text-white/30">
                  {t('pwx.trust.spread', bands)}
                  <button type="button" onClick={() => patch({ trust: 'all' })}
                    className="ml-2 underline decoration-dotted hover:text-white/70">
                    {t('pwx.trust.filterAll')}
                  </button>
                </p>
              )}
            </div>
          ) : (
            visible.map((r) => (
              <ExplorerRow key={r.key} row={r}
                onPickBand={(b) => patch({ trust: b === 'sure' ? 'sure' : b === 'doubt' ? 'doubt' : 'suspect' })}
                verdict={verdicts.of(r.listing.url)}
                onVerdict={(v) => verdicts.set(r.listing.url, v)}
                onPickVerdict={(v) => patch({ audit: v })} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
