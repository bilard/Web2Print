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
import { createPortal } from 'react-dom'
import { RefreshCw, Loader2, Download, FileSpreadsheet, PanelLeftClose, ChevronsRight } from 'lucide-react'
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
import { diagnoseEmptySearch } from './emptySearch'
import { useGlobalSearch } from './useGlobalSearch'
import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { withVisual } from './confidence'
import { buildTokenIndex, filterRows, EMPTY_EXPLORER_FILTER, type ExplorerFilter } from './filters'
import { computeStats, countBands, countSourceFacts } from './stats'
import { rowsToCsv } from './exportCsv'
import { downloadRowsXlsx } from './exportXlsx'
import { rowDomain, rowSiteId } from './compilation'
import { useCompilation } from './useCompilation'
import { useAllVerdicts } from './useAllVerdicts'
import { ExplorerCompileBar } from './ExplorerCompileBar'
import { ExplorerCatalog } from './ExplorerCatalog'
import { ExplorerCatalogStats } from './ExplorerCatalogStats'
import { filterCatalog, catalogFacts } from './catalogList'
import { ExplorerRailModes, type ExplorerMode } from './ExplorerRailModes'
import { TextEnrichScreen } from '../textEnrich/TextEnrichScreen'
import { useSourceSheet } from './useSourceSheet'
import { usePairingRules } from '../usePairingRules'
import { useVerdicts } from './useVerdicts'
import { useVisuals } from '../visual/useVisuals'
import { useTranslation, intlLocale } from '@/lib/i18n'
import { debugLog } from '@/lib/debugLog'

const iconBtn = 'bg-well text-white/55 text-xs rounded px-2.5 py-2 border border-white/10 hover:text-white hover:border-white/25 disabled:opacity-40 disabled:hover:text-white/55 disabled:hover:border-white/10 flex items-center gap-1.5 transition-colors shrink-0'

export function CompetitorExplorer({ watchId, workflowId, initialMode = null }: { watchId: string | null; workflowId?: string; initialMode?: ExplorerMode }) {
  const { t, locale } = useTranslation()
  // Milliers séparés : à six chiffres, « 186170 » ne se lit pas d'un coup d'œil.
  const nf = (v: number) => v.toLocaleString(intlLocale(locale))
  const uid = useWorkspaceUid()
  const meta = useCompetitorMeta(watchId)
  // Rapport agrégé : il porte l'appariement et l'écart médian PAR SITE, calculés avant
  // tout plafond d'affichage. C'est ce qui permet de mesurer les 19 concurrents sans en
  // charger un seul.
  const report = useCatalogReport(watchId)
  const sites = useMemo(() => buildRail(meta, report?.byCompetitor ?? []), [meta, report])
  // Concurrents qu'un balayage transversal peut lire : ceux qui ont des fiches. Les sites
  // EN PAUSE en font partie — leurs relevés d'hier sont intacts, et un appariement douteux
  // qu'on a cessé de rafraîchir reste un appariement douteux à trancher.
  const scannable = useMemo(
    () => sites.filter((s) => s.collected > 0).map((s) => ({ siteId: s.siteId, domain: s.domain })),
    [sites],
  )
  const [siteId, setSiteId] = useState<string | null>(null)
  const active = siteId && sites.some((s) => s.siteId === siteId) ? siteId : (sites.find((s) => s.collected > 0)?.siteId ?? null)
  const domain = sites.find((s) => s.siteId === active)?.domain ?? ''

  // ── Compilation : tous les concurrents, seulement ce qui reste à contrôler ────────
  // Elle REMPLACE la liste du site affiché — c'est un changement de périmètre, pas un
  // filtre. Déclarée ICI parce que l'index du concurrent affiché est RELÂCHÉ pendant le
  // balayage : garder 186 000 fiches d'un côté pendant qu'on en lit vingt-quatre index de
  // l'autre ferait tomber l'onglet. Il se recharge en fermant la compilation.
  const compilation = useCompilation(uid, watchId)
  const compiling = compilation.running || compilation.finished

  const source = useSourceCatalog(watchId)
  const { listings, loading, error, reload } = useSiteListings(watchId, compiling ? null : active)
  const src = useSourceSheet(watchId)
  // ⚠ Cet écran DOIT apparier avec les mêmes règles que le comparatif, sinon il montre
  // des cellules absentes du rapport (ou l'inverse) et l'audit porte sur autre chose que
  // ce qui a été livré. C'est la raison pour laquelle les règles vivent en Firestore et
  // non dans la config d'un node : cet écran n'appartient à aucun workflow.
  const pairingRules = usePairingRules(watchId)
  const { extras } = src
  // Jugements d'audit du concurrent affiché : ils survivent à la session.
  const verdicts = useVerdicts(watchId, active)
  // Comparaison des photos, produite par le node « Comparer les visuels ».
  const visuals = useVisuals(watchId, active)

  const [filter, setFilter] = useState<ExplorerFilter>(EMPTY_EXPLORER_FILTER)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0])
  const [taxoOpen, setTaxoOpen] = useState(true)
  // ⚠ La cible du portail n'existe qu'APRÈS le premier rendu du panneau parent : la
  // chercher pendant le rendu rendrait `null` pour toujours.
  const [searchSlot, setSearchSlot] = useState<HTMLElement | null>(null)
  const [settingsSlot, setSettingsSlot] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setSearchSlot(document.getElementById('explorer-search-portal'))
    setSettingsSlot(document.getElementById('explorer-settings-portal'))
  }, [])
  const [railOpen, setRailOpen] = useState(true)
  const patch = (p: Partial<ExplorerFilter>) => { setFilter((f) => ({ ...f, ...p })); setPage(0) }

  // Appariement + écarts : recalculés quand le site OU le catalogue change. Sur des
  // dizaines de milliers de produits l'opération est en O(produits) sur un index en
  // mémoire — quelques centaines de ms, une seule fois par onglet.
  const paired = useMemo(
    () => {
      if (!active || listings.length === 0) return []
      const t0 = performance.now()
      const out = pairSiteListings(source.products, active, listings, {
        vatRate: source.vatRate, extras: extras.lookup,
        imagePrefix: src.imagePrefix, productUrl: src.productUrl,
        rules: pairingRules.rules,
      })
      // Cet appariement tourne SUR LE CHEMIN DE RENDU et rejoue quand le catalogue source
      // arrive : à 186 000 fiches, une seconde ici fige l'onglet. Mesuré pour qu'un
      // ralentissement se voie dans la console au lieu de passer pour un plantage.
      debugLog('[pw-explorer] appariement', out.length, 'lignes en', Math.round(performance.now() - t0), 'ms')
      return out
    },
    [active, listings, source.products, source.vatRate, extras, src.imagePrefix, src.productUrl, pairingRules.rules],
  )
  // Le verdict des PHOTOS pèse dans l'indice — c'est le seul démenti qui porte sur les
  // objets et non sur des chaînes de caractères. Recousu ICI et non dans `pairSiteListings` :
  // les verdicts arrivent par un autre chemin, longtemps après l'appariement, et les
  // injecter en amont relancerait toute la passe de jointure à chaque fois qu'ils tombent.
  const siteRows = useMemo(() => {
    if (visuals.size === 0) return paired
    return paired.map((r) => {
      if (!r.confidence) return r
      const v = visuals.of(r.key)
      return v ? { ...r, confidence: withVisual(r.confidence, v.verdict) } : r
    })
  }, [paired, visuals.of, visuals.size])

  // ── Compilation : tous les concurrents, seulement ce qui reste à contrôler ────────
  // Elle REMPLACE la liste du site affiché — c'est un changement de périmètre, pas un
  // filtre. Tout ce qui suit (filtres, taxonomie, stats, export) travaille sur `rows`
  // sans savoir d'où elles viennent.
  const rows = compiling ? compilation.rows : siteRows
  // Les verdicts ne sont relus qu'une fois le balayage FINI : recharger à chaque site
  // ajouté ferait trois cents lectures pour vingt-quatre documents.
  const compiledSiteIds = useMemo(
    () => (compilation.finished ? [...new Set(compilation.rows.map((r) => r.siteId))] : []),
    [compilation.finished, compilation.rows],
  )
  const allVerdicts = useAllVerdicts(watchId, compiledSiteIds)
  // ⚠ Le verdict s'écrit dans le document du CONCURRENT de la ligne. En compilation,
  // l'adresse seule ne dit pas de quel site elle vient : on garde la correspondance.
  const siteByUrl = useMemo(() => {
    if (!compiling) return null
    const m = new Map<string, string>()
    for (const r of compilation.rows) m.set(r.listing.url, r.siteId)
    return m
  }, [compiling, compilation.rows])
  const verdictOf = useMemo(
    () => (compiling && siteByUrl
      ? (url: string) => allVerdicts.of(siteByUrl.get(url) ?? '', url)
      : verdicts.of),
    [compiling, siteByUrl, allVerdicts, verdicts.of],
  )
  // ⚠ Pas de suggestions PENDANT un balayage : l'index se recalcule à chaque site qui
  // tombe, sur le cumul déjà rassemblé — quatre passes complètes vingt-quatre fois de
  // suite, pour des mots-clés que personne ne lit tant que la liste grossit.
  const tokenIndex = useMemo(
    () => (compilation.running ? [] : buildTokenIndex(rows)),
    [rows, compilation.running],
  )
  // Sans catalogue source, TOUTES les fiches sont orphelines : garder le filtre « appariés
  // seulement » viderait l'écran et ferait croire à une collecte vide.
  const noSource = source.products.length === 0

  // Recherche transversale : le concurrent affiché n'est qu'un des vingt-quatre. Une
  // référence absente ICI est souvent présente AILLEURS, et l'écran ne le disait pas.
  const globalSearch = useGlobalSearch(uid, watchId)
  const searchMiss = useMemo(
    () => (filter.q.trim() ? diagnoseEmptySearch(filter.q, source.products) : null),
    [filter.q, source.products],
  )
  // Reporté sur le rail, la seule vue d'ensemble des vingt-quatre concurrents : « trouvé
  // chez 13 » ne disait pas LESQUELS parmi ceux de gauche.
  // Mode « Mon catalogue » : la liste centrale montre les produits SOURCE, sans
  // concurrent. C'est l'autre moitié de l'écran, celle qui manquait — on ne pouvait
  // consulter son propre catalogue qu'à travers ce qu'un marchand en vendait.
  // UN seul mode courant : les trois vues (concurrent, catalogue, traduction) occupent la
  // même zone centrale, et deux drapeaux indépendants laissaient possible un état où les
  // deux sont vrais. L'écran de traduction vit ICI et pas dans le workflow parce que
  // c'est ici qu'on constate qu'un texte est en allemand.
  const [mode, setMode] = useState<ExplorerMode>(initialMode)
  const catalogMode = mode === 'catalog'
  const enrichMode = mode === 'enrich'
  const searchHitsBySite = useMemo(
    () => new Map(globalSearch.hits.map((h) => [h.siteId, h.count])),
    [globalSearch.hits],
  )
  // Une nouvelle saisie invalide le balayage précédent : afficher les résultats d'une
  // autre requête serait pire que ne rien afficher.
  useEffect(() => { globalSearch.reset() }, [filter.q, globalSearch.reset])
  const effective = useMemo(
    () => {
      // En compilation, toutes les lignes sont appariées par construction, et les verdicts
      // VISUELS n'ont pas été chargés (ils se lisent par site) : garder le filtre d'image
      // viderait la liste sur un signal qu'on n'a pas.
      if (compiling) return { ...filter, pairing: 'matched' as const, visual: 'all' as const }
      return noSource ? { ...filter, pairing: 'all' as const } : filter
    },
    [filter, noSource, compiling],
  )
  // Idem : pas de verdict visuel en compilation, donc aucune lambda à passer aux filtres.
  const visualOf = compiling ? undefined : visuals.of
  // Deux passes : l'arbre se nourrit des lignes filtrées SANS la taxonomie (ses compteurs
  // suivent la recherche, mais choisir une famille ne doit pas amputer l'arbre lui-même),
  // la liste applique le filtre complet.
  const beforeTaxo = useMemo(() => filterRows(rows, { ...effective, path: [] }, verdictOf, visualOf), [rows, effective, verdictOf, visualOf])
  const filtered = useMemo(
    () => (effective.path.length === 0 ? beforeTaxo : filterRows(rows, effective, verdictOf, visualOf)),
    [rows, effective, beforeTaxo, verdictOf, visualOf],
  )
  const stats = useMemo(() => computeStats(filtered, visualOf), [filtered, visualOf])
  // ── Vue « Mon catalogue » : le même appareil de contrôle, branché sur MES produits ──
  // Recherche et famille s'y appliquent comme chez un concurrent ; le pager, la mesure et
  // l'arbre lisent CES listes-là. Calculé ici et non dans la vue pour que la barre d'outils
  // et l'arbre disposent des mêmes nombres qu'elle — sinon le pager annonce une page 3 sur
  // une liste qui n'en a qu'une.
  //
  // ⚠ L'écran de TRADUCTION en dépend aussi : il travaille sur les mêmes produits, donc
  // sur le même arbre. Réservée au seul mode catalogue, cette passe laissait la colonne
  // de gauche proposer les quatre familles du concurrent affiché (1 005 · 131 · 28 · 19)
  // à qui vient traduire cent quinze mille fiches — et cliquer dedans ne filtrait rien.
  const catalogScope = catalogMode || enrichMode
  const catalogBeforeTaxo = useMemo(
    () => (catalogScope ? filterCatalog(source.products, filter.q, []) : []),
    [catalogScope, source.products, filter.q],
  )
  // ⚠ Gardés par `catalogMode`, comme la passe au-dessus : ces filtres traversent les
  // 115 814 produits SUR LE CHEMIN DE RENDU. Les laisser tourner face à un concurrent
  // ajoutait une recherche complète + cinq passes de comptage à chaque clic dans l'arbre,
  // pour un résultat que rien n'affiche.
  const catalogFound = useMemo(
    () => (!catalogMode ? [] : filter.path.length === 0 ? catalogBeforeTaxo : filterCatalog(source.products, filter.q, filter.path)),
    [catalogMode, catalogBeforeTaxo, filter.path, source.products, filter.q],
  )
  const catFacts = useMemo(
    () => catalogFacts(catalogMode ? source.products : [], catalogFound),
    [catalogMode, source.products, catalogFound],
  )
  // L'arbre classe les CHEMINS de ce qui est affiché : ceux de MON catalogue dès qu'on le
  // parcourt ou qu'on en traduit les textes, ceux des fiches appariées face à un concurrent.
  const taxoPaths = useMemo(
    () => (catalogScope
      ? catalogBeforeTaxo.map((p) => p.taxo ?? [])
      : beforeTaxo.map((r) => r.source?.path ?? [])),
    [catalogScope, catalogBeforeTaxo, beforeTaxo],
  )
  // Répartition des bandes sur TOUT le site, pas sur les lignes filtrées : elle sert à
  // expliquer une liste vidée par le filtre de fiabilité.
  const bands = useMemo(() => countBands(rows), [rows])

  const facts = useMemo(() => ({
    ...countSourceFacts(source.products),
    // La PREMIÈRE adresse réellement présente, pas un gabarit reconstruit : c'est elle
    // qu'on veut ouvrir pour savoir si la colonne mappée est la bonne.
    sampleUrl: source.products.find((p) => p.url)?.url,
    workflowId,
    partial: source.partial,
    expected: source.expected,
    sourceRows: source.sourceRows,
    bytes: source.bytes,
    ms: source.ms,
  }), [source.products, source.partial, source.expected, source.sourceRows, source.bytes, source.ms, workflowId])

  // Le nombre de pages rétrécit avec les filtres : rester sur la page 7 d'un résultat qui
  // n'en compte plus que 2 afficherait une liste vide sans rien expliquer. Le changement
  // de VUE compte aussi : la page 40 d'un concurrent n'a pas de sens au catalogue.
  useEffect(() => { setPage(0) }, [active, compiling, mode])
  // ⚠ Le chemin choisi appartient à l'arbre de la vue qu'on quitte : les familles d'un
  // concurrent ne sont qu'une part de celles du catalogue. Le conserver vidait la liste
  // d'arrivée sans qu'aucun contrôle visible n'explique pourquoi.
  useEffect(() => { setFilter((f) => (f.path.length === 0 ? f : { ...f, path: [] })) }, [mode])
  // Le pager commande la vue AFFICHÉE, quelle qu'elle soit : concurrent ou catalogue.
  const pagedTotal = catalogMode ? catalogFound.length : filtered.length
  const pageCount = Math.max(1, Math.ceil(pagedTotal / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize)

  // Les deux exports rendent les lignes AFFICHÉES, filtres compris : un export qui ne
  // correspondrait pas à l'écran n'aurait aucune valeur de preuve.
  const domainOf = (r: typeof filtered[number]) => rowDomain(r, domain)
  const baseName = compiling ? `a-valider-${compilation.total}-concurrents` : `concurrent-${domain}`

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob(['﻿' + rowsToCsv(filtered, domainOf)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = `${baseName}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const exportXlsx = () => {
    downloadRowsXlsx(
      filtered,
      { domainOf, verdictOf: (r) => verdictOf(r.listing.url) },
      `${baseName}.xlsx`,
    )
  }

  if (!watchId) return <p className="text-sm text-white/40 py-8 text-center">{t('pwx.aucunSuiviDeVeille')}</p>

  return (
    <div className="h-full flex flex-col min-h-0" data-pw-section="explorer">
      {/* ── Étage 1 · mesure : où j'en suis face à lui ───────────────────────── */}
      {/* ⚠ La mesure suit la VUE. En « Mon catalogue » elle décrit le catalogue ; l'écran
          de traduction porte ses propres compteurs et n'en veut aucun ici. Laisser la
          ligne du concurrent partout affichait « appariées 1 183 / 103 407 » au-dessus de
          « 115 814 produits » : des chiffres justes au mauvais endroit se lisent faux. */}
      {enrichMode ? null : catalogMode ? (
        <div className="flex items-center gap-5 px-3 py-2.5 bg-surface-2/60 border-b border-white/[0.06] flex-wrap">
          <ExplorerCatalogStats facts={catFacts} loading={source.loading}
            partial={source.partial} expected={source.expected} />
        </div>
      ) : (
      <div className="flex items-center gap-5 px-3 py-2.5 bg-surface-2/60 border-b border-white/[0.06] flex-wrap">
        {/* Tant que le catalogue source n'est pas relu, la position tarifaire n'existe pas :
            afficher un ruban à zéro se lirait comme « aligné partout ». On dit ce qui est
            en cours, avec son avancement — la liste, elle, reste consultable. */}
        {source.loading ? (
          <div className="flex items-center gap-2 text-[11px] text-amber-200/80 whitespace-nowrap">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {source.progress.total > 0
              ? t('pwx.source.pending.progress', {
                  done: source.progress.done, total: source.progress.total,
                  count: source.progress.expected.toLocaleString('fr-FR'),
                })
              : t('pwx.source.pending')}
          </div>
        ) : (
          <ExplorerPositionBar stats={stats} active={effective.gap} onPick={(gap) => patch({ gap })} />
        )}
        <div className="h-8 w-px bg-white/10 hidden lg:block" />
        <ExplorerStats stats={stats} collected={compiling ? compilation.scanned : listings.length} pairingPending={source.loading}
          promoOnly={effective.promoOnly} outOfStockOnly={effective.stock === 'out-of-stock'}
          suspectsOnly={effective.trust === 'suspect'} visualDiffOnly={effective.visual === 'different'}
          onTogglePromo={() => patch({ promoOnly: !effective.promoOnly })}
          onToggleStock={() => patch({ stock: effective.stock === 'out-of-stock' ? 'all' : 'out-of-stock' })}
          onToggleSuspects={() => patch({ trust: effective.trust === 'suspect' ? 'all' : 'suspect' })}
          onToggleVisualDiff={() => patch({ visual: effective.visual === 'different' ? 'all' : 'different' })} />
      </div>
      )}

      {/* ── Étage 2 · contrôle : chercher, filtrer, paginer ──────────────────── */}
      <div className="px-3 py-2 space-y-2 border-b border-white/10">
        <div className="flex items-center gap-2 flex-wrap">
          {/* La recherche s'affiche dans la barre de TITRE : elle occupait ici une ligne
              entière pour elle seule, au-dessus des filtres. Rendue par portail, elle
              garde son index de suggestions — qui vit dans ce composant. */}
          {searchSlot && createPortal(
            <ExplorerSearch rows={catalogMode || enrichMode ? [] : rows}
              tokenIndex={catalogMode || enrichMode ? [] : tokenIndex} value={filter.q}
              onChange={(q) => patch({ q })}
              onAddToken={(tk) => patch({ tokens: filter.tokens.includes(tk) ? filter.tokens : [...filter.tokens, tk] })} />,
            searchSlot,
          )}
          {/* Appariement, promo, rupture, fiabilité, visuel : tout se juge FACE à un
              concurrent. Hors de cette vue, ces filtres ne pilotent rien. */}
          {!catalogMode && !enrichMode && <ExplorerFilters filter={effective} onChange={patch} />}
          <div className="ml-auto flex items-center gap-2">
            {/* Avancement de l'audit : le seul chiffre qui mesure le TRAVAIL fait, pas
                l'état des données. Sa place est près des contrôles qui le produisent. */}
            {!catalogMode && !enrichMode && (() => {
              const counts = compiling ? allVerdicts.counts : verdicts.counts
              return (counts.ok > 0 || counts.ko > 0) && (
                <span className="text-[10px] text-white/30 tabular-nums whitespace-nowrap">
                  {t('pwx.verdict.done', counts)}
                </span>
              )
            })()}
            {/* Le pager sert les DEUX listes. L'écran de traduction, lui, découpe par lots
                de traitement et non par pages : deux paginations concurrentes s'y
                contrediraient. */}
            {!enrichMode && (
              <ExplorerPager total={pagedTotal} page={safePage} pageSize={pageSize}
                onPage={setPage} onPageSize={setPageSize} />
            )}
            {/* Relecture et exports portent sur les fiches du concurrent : les laisser
                actifs au catalogue exporterait la liste d'à côté. */}
            {!catalogMode && !enrichMode && (<>
            <button type="button" onClick={reload} disabled={loading || compiling} className={iconBtn} title={t('pwx.reload')}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button type="button" onClick={exportCsv} disabled={filtered.length === 0} className={iconBtn} title={t('pwx.exportCsv')}>
              <Download className="w-3.5 h-3.5" />
            </button>
            {/* Classeur : les prix et les écarts y sont de vrais nombres, avec la
                fiabilité, les motifs de doute et le verdict déjà rendu. C'est le fichier
                qu'on trie et qu'on annote ; le CSV reste pour les reprises automatiques. */}
            <button type="button" onClick={exportXlsx} disabled={filtered.length === 0} className={iconBtn} title={t('pwx.exportXlsx')}>
              <FileSpreadsheet className="w-3.5 h-3.5" />
            </button>
            </>)}
            {settingsSlot && createPortal(
              <ExplorerSourceSettings facts={facts} databases={src.databases} dbId={src.dbId} onPickDb={src.setDbId}
                loading={src.loading} sheets={src.sheets} sheetIndex={src.sheetIndex}
                onPickSheet={src.setSheetIndex} extras={extras} absent={source.absent}
                imagePrefix={src.imagePrefix} onImagePrefix={src.setImagePrefix}
                productUrl={src.productUrl} onProductUrl={src.setProductUrl} />,
              settingsSlot,
            )}
          </div>
        </div>
        {!catalogMode && !enrichMode && <ExplorerTokens filter={effective} onChange={patch} tokenIndex={tokenIndex} />}
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
            <ExplorerRailModes mode={mode} catalogCount={source.products.length}
              onPick={(m) => { setMode(m); compilation.reset() }} />
            <ExplorerCompileBar state={compilation} sites={scannable.length} ready={!noSource}
              onRun={() => void compilation.run(
                scannable, source.products,
                { vatRate: source.vatRate, extras: extras.lookup, imagePrefix: src.imagePrefix, productUrl: src.productUrl },
              )}
              onClose={() => { compilation.reset(); setPage(0) }} />
            <div className="flex-1 min-h-0">
              <ExplorerSiteRail items={sites} active={catalogMode || enrichMode || compiling ? null : active}
                loading={loading} searchHits={searchHitsBySite}
                onPick={(id) => { compilation.reset(); setMode(null); setSiteId(id) }} />
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
            <ExplorerTaxonomyTree paths={taxoPaths} selected={effective.path}
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

        {/* Mon catalogue REMPLACE la vue par paires : il n'y a pas de concurrent en face,
            et garder une colonne vide à droite laisserait croire à un appariement raté. */}
        {enrichMode ? (
          <TextEnrichScreen uid={uid ?? ''} watchId={watchId} products={source.products}
            loading={source.loading} query={filter.q} path={effective.path}
            imagePrefix={src.imagePrefix} />
        ) : catalogMode ? (
          <ExplorerCatalog products={catalogFound} page={safePage} pageSize={pageSize}
            imagePrefix={src.imagePrefix} loading={source.loading} />
        ) : (
        <div className="flex-1 min-w-0 overflow-auto">
          <div className="grid grid-cols-2 text-[10px] uppercase tracking-wider sticky top-0 z-20 bg-surface-2 border-b border-white/10 shadow-[0_1px_0_rgba(255,255,255,0.04)]">
            {/* Le résultat du filtre, CHIFFRÉ, à l'endroit où la liste commence. Le compte
                figurait déjà dans la pagination, mais à l'autre bout de la barre d'outils :
                après un clic sur une famille ou une bande de fiabilité, le regard est sur
                la liste, pas sur le pager. Quand un filtre est actif on donne les DEUX
                nombres — « 240 sur 186 170 » dit à la fois ce qui reste et ce qui a été
                écarté, là où « 240 » seul ne se distingue pas d'une collecte maigre. */}
            <div className="px-3 py-2 text-indigo-300/80 font-medium flex items-center gap-2">
              {t('pwx.monProduitF1')}
              {!loading && rows.length > 0 && (
                <span className="ml-auto normal-case tracking-normal tabular-nums text-white/40"
                  title={filtered.length === rows.length ? undefined : t('pwx.header.filtered.help')}>
                  {filtered.length === rows.length
                    ? t('pwx.header.rows', { count: nf(rows.length) })
                    : t('pwx.header.filtered', { shown: nf(filtered.length), total: nf(rows.length) })}
                </span>
              )}
            </div>
            <div className="px-3 py-2 border-l border-white/10 text-white/50 font-medium">
              {compiling ? t('pwx.compile.allSites', { count: compilation.total }) : (domain || t('pw.col.competitor'))}
            </div>
          </div>

          {/* ⚠ Ne PAS attendre `source.loading` ici : les fiches du concurrent sont déjà
              lues et paginées, seul l'appariement manque. Bloquer la liste sur le
              catalogue source laissait l'écran sur son spinner alors que 186 000 fiches
              étaient prêtes à l'affichage. */}
          {loading && !compiling ? (
            <div className="py-16 text-center text-white/40 text-sm flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />{t('pwx.lectureDesFichesCollectees')}
            </div>
          ) : error && !compiling ? (
            <div className="py-16 text-center text-rose-300 text-sm">{error}</div>
          ) : visible.length === 0 ? (
            <div className="py-16 text-center text-white/40 text-sm space-y-2">
              {/* Une liste vide PENDANT un balayage n'est pas un résultat : elle le
                  deviendra. Annoncer « aucune fiche » ici se lirait comme une panne. */}
              {compilation.running ? (
                <p className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('pwx.compile.progress', { done: compilation.done, total: compilation.total, rows: 0 })}
                </p>
              ) : (
                <p>{rows.length === 0
                  ? (compiling ? t('pwx.compile.empty') : t('pwx.aucuneFicheCollecteePour'))
                  : t('pwx.aucuneFicheNeCorrespond')}</p>
              )}
              {/* Une recherche par clé qui ne rend rien se lit comme une saisie fausse.
                  Or le produit est souvent au catalogue — c'est CE concurrent qui ne le
                  vend pas. Le catalogue source est déjà en mémoire : on tranche entre les
                  deux sans un accès réseau, et on le dit. */}
              {/* Le produit est-il seulement au catalogue ? La réponse tient dans les
                  données déjà en mémoire, et elle sépare « saisie fausse » de « ce
                  concurrent ne le vend pas ». */}
              {searchMiss && (
                <p className="text-[11px] text-emerald-300/70 max-w-xl mx-auto leading-relaxed">
                  {t('pwx.search.inCatalog', { name: searchMiss.product.name, ref: searchMiss.product.ref ?? '—', domain })}
                </p>
              )}
              {/* Balayage des VINGT-QUATRE concurrents. À la demande : c'est plusieurs
                  secondes de réseau et des centaines de milliers de fiches — on ne
                  l'impose pas à chaque frappe. */}
              {filter.q.trim() && !globalSearch.running && !globalSearch.finished && (
                <button type="button"
                  onClick={() => void globalSearch.run(filter.q, scannable)}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-[12px] text-indigo-200 hover:bg-indigo-500/20 transition-colors">
                  {t('pwx.search.scanAll', { count: scannable.length })}
                </button>
              )}
              {globalSearch.running && (
                <p className="text-[11px] text-white/40 flex items-center justify-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {t('pwx.search.scanning', { done: globalSearch.done, total: globalSearch.total })}
                </p>
              )}
              {globalSearch.hits.length > 0 && (
                <div className="mx-auto max-w-xl space-y-1 pt-1 text-left">
                  <p className="text-[11px] text-white/40 text-center">{t('pwx.search.foundOn', { count: globalSearch.hits.length })}</p>
                  {globalSearch.hits.map((h) => (
                    <button key={h.siteId} type="button" onClick={() => { setSiteId(h.siteId); setPage(0) }}
                      className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left hover:border-indigo-400/50 hover:bg-white/[0.06] transition-colors">
                      <span className="text-[12px] font-medium text-white/80">{h.domain}</span>
                      <span className="ml-2 text-[11px] tabular-nums text-white/35">{t('pwx.search.hitCount', { count: h.count })}</span>
                      <span className="block truncate text-[11px] text-white/45">{h.sample.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {globalSearch.finished && globalSearch.hits.length === 0 && (
                <p className="text-[11px] text-white/30">{t('pwx.search.foundNowhere')}</p>
              )}
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
              /* ⚠ La clé porte le site : en compilation, deux marchands d'une même
                 marketplace peuvent référencer la même adresse de fiche. */
              <ExplorerRow key={`${rowSiteId(r, active ?? '')}|${r.key}`} row={r}
                domain={compiling ? rowDomain(r, domain) : undefined}
                onPickBand={(b) => patch({ trust: b === 'sure' ? 'sure' : b === 'doubt' ? 'doubt' : 'suspect' })}
                verdict={verdictOf(r.listing.url)}
                onVerdict={(v) => (compiling
                  ? allVerdicts.set(rowSiteId(r, active ?? ''), r.listing.url, v)
                  : verdicts.set(r.listing.url, v))}
                onPickVerdict={(v) => patch({ audit: v })}
                visual={visualOf?.(r.listing.url)} />
            ))
          )}
        </div>
        )}
      </div>
    </div>
  )
}
