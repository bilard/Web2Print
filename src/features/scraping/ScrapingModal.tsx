import { useState, useRef } from 'react'
import { Globe, Download, AlertCircle, Sparkles, Map as MapIcon, FolderSync, Loader2, ExternalLink, Tag, Search, Folder, Coins, FolderUp } from 'lucide-react'
import { CloseButton } from '@/components/shared/CloseButton'
import { TypedLogConsole } from '@/features/excel/ai-enrichment/TypedLogConsole'
import { useJina, scrapeResultToSheet, enrichedProductToSheet, enrichedProductsToSheet, detectBrandLabelFromUrl } from './useJina'
import { useDamMigration } from '@/features/dam/useDamMigration'
import type { ScrapingField, ScrapingMode, ScrapeResult, MapLink, CrawlPage, ExtractionTarget } from './useJina'
import type { EnrichedProduct } from '@/features/excel/ai-enrichment/types'
import type { ExcelSheet, ExcelRow } from '@/features/excel/types'
import { buildTaxonomyFromLevels } from '@/features/excel/taxonomyBuilder'
import { ScrapeTab } from './ScrapeTab'
import { MapExtractTab } from './MapExtractTab'
import { CrawlTab } from './CrawlTab'
import { SearchTab } from './SearchTab'
import { ScrapingPreview } from './ScrapingPreview'
import { ProductEnrichedView } from './ProductEnrichedView'
import { useExcelStore } from '@/stores/excel.store'
import { useProductEnrichment } from '@/features/excel/ai-enrichment/useProductEnrichment'
import { useEnrichmentStore } from '@/features/excel/ai-enrichment/enrichmentStore'
import { enrichmentKey } from '@/features/excel/ai-enrichment/types'
import { ENRICHMENT_COLUMNS, buildEnrichmentColumn, serializeEnriched } from '@/features/excel/ai-enrichment/useSaveEnrichedProduct'
import { matchRows, applyPreview } from '@/features/pim'
import type { MergePreview, Source } from '@/features/pim/types'
import { useUpsertProducts } from '@/features/pim/useProducts'
import { useUpsertSource } from '@/features/pim/useSources'
import { usePimStore } from '@/stores/pim.store'
import { useTaxonomies } from '@/features/taxonomy/useTaxonomies'
import { useBulkAttachToTaxonomy } from '@/features/taxonomy/useBulkAttachToTaxonomy'
import { MatchPreviewModal } from '@/components/pim/MatchPreviewModal'
import { scrapeResultToColumns } from './core/scrapeToRows'
import { filterByInstruction } from './instructionFilter'
import { toast } from 'sonner'
import { useEffect } from 'react'
import { addUsageObserver } from '@/features/stats/aiUsageTracking'
import { t } from '@/lib/i18n'

/** Clé synthétique : la modal de scraping n'a pas de feuille — on isole dans
 *  un namespace dédié pour ne pas polluer les enrichissements de feuilles
 *  Excel réelles. */
const SCRAPE_MODAL_SHEET = '__scrape_modal__'

type Tab = 'scrape' | 'map' | 'crawl' | 'search'

interface Props {
  open: boolean
  onClose: () => void
  /** Chemin cible dans l'arbre de bases de données (racine = []). */
  targetPath?: string[]
  /** Source existante à re-scraper : son ID est réutilisé (pas de doublon). */
  resyncSource?: Source
}

const TABS: { id: Tab; label: string; Icon: typeof Globe; color: string }[] = [
  { id: 'scrape', label: 'Scrape', Icon: Sparkles, color: 'text-indigo-400' },
  { id: 'map', label: 'Map + Extract', Icon: MapIcon, color: 'text-blue-400' },
  { id: 'crawl', label: 'Crawl', Icon: FolderSync, color: 'text-amber-400' },
  { id: 'search', label: 'Recherche', Icon: Search, color: 'text-emerald-400' },
]

export function ScrapingModal({ open, onClose, targetPath, resyncSource }: Props) {
  const { migrateActiveSheet } = useDamMigration()
  // Activé par DÉFAUT : centralisation DAM à chaque scraping (sauf opt-out explicite « 0 »).
  const [autoDam, setAutoDam] = useState(() => localStorage.getItem('dam.autoCentralize') !== '0')
  const [tab, setTab] = useState<Tab>('scrape')
  const [url, setUrl] = useState(resyncSource?.url ?? '')
  /** Instruction en langage naturel : filtre le crawl/map et oriente l'extraction
   *  (ex. « ne garder que les perceuses Makita »). Vide = comportement inchangé. */
  const [instruction, setInstruction] = useState('')
  /** Journal de la phase DÉCOUVERTE + FILTRE (crawl/map), avant enrichissement.
   *  Rendu via TypedLogConsole (classification par regex). */
  const [discoveryLogs, setDiscoveryLogs] = useState<string[]>([])
  const pushDiscoveryLog = (m: string) => setDiscoveryLogs((l) => [...l, m])
  const [result, setResult] = useState<ScrapeResult | null>(null)
  const [lastFields, setLastFields] = useState<ScrapingField[]>([])
  const [crawlPages, setCrawlPages] = useState<CrawlPage[]>([])

  /** Batch d'enrichissement multi-URLs (Map+Extract et Crawl) :
   *  applique la pipeline `enrich()` (Produit complet) à chaque URL. */
  interface BatchItem {
    url: string
    title: string
    rowId: string
    product?: EnrichedProduct
    error?: string
    status: 'pending' | 'running' | 'done' | 'failed'
  }
  const [batch, setBatch] = useState<BatchItem[]>([])
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchCurrentIdx, setBatchCurrentIdx] = useState<number | null>(null)
  /** Annulation demandée — affichée immédiatement dans l'UI même si
   *  l'item courant continue (enrich() n'accepte pas d'AbortSignal). */
  const [batchAborting, setBatchAborting] = useState(false)
  /** Option « + fabricant » : à l'import, ouvre la fiche et lance la comparaison. */
  const [verifyAfterImport, setVerifyAfterImport] = useState(false)
  /** Index de l'item du batch dont la fiche détaillée (`ProductEnrichedView`)
   *  est actuellement affichée. null = liste seule. */
  const [batchPreviewIdx, setBatchPreviewIdx] = useState<number | null>(null)
  const batchAbortRef = useRef(false)
  const { scrape, map, discover, abort, loading, error } = useJina()
  const { setSheets, setCurrentFileName, sheets } = useExcelStore()
  const setCurrentPath = useExcelStore((s) => s.setCurrentPath)

  // Auto-classement IA après import : taxonomie cible (optionnelle).
  const { data: taxonomies } = useTaxonomies()
  const bulkAttach = useBulkAttachToTaxonomy()
  const [importTaxoId, setImportTaxoId] = useState<string>('')

  // Pipeline d'enrichissement réutilisée pour le mode "Produit unique" :
  // produit la structure riche (advantages groupés, variants, specs communes
  // par groupe) directement depuis l'URL, sans passer par une feuille Excel.
  const { enrich, running: enriching, reset: resetEnrich } = useProductEnrichment()
  const clearEnrichEntry = useEnrichmentStore((s) => s.clear)
  const enrichRowId = (() => {
    try { return new URL(url).pathname.replace(/[^a-z0-9]/gi, '_').slice(0, 80) || 'pending' }
    catch { return 'pending' }
  })()
  const enrichKey = enrichmentKey(SCRAPE_MODAL_SHEET, enrichRowId)
  const enrichEntry = useEnrichmentStore((s) => s.entries[enrichKey])
  const enrichLogs = useEnrichmentStore((s) => s.logs[enrichKey] ?? [])

  // Subscribe live au progress de l'item courant du batch (texte qui change
  // pendant une itération unique d'`enrich()`).
  const allEntries = useEnrichmentStore((s) => s.entries)

  // Logs temps réel de l'item courant du batch (pile cascade Jina/Firecrawl/BrightData).
  const batchCurrentRowId = batchRunning && batchCurrentIdx !== null
    ? (batch[batchCurrentIdx]?.rowId ?? null)
    : null
  const batchCurrentLogs = useEnrichmentStore((s) =>
    batchCurrentRowId ? (s.logs[enrichmentKey(SCRAPE_MODAL_SHEET, batchCurrentRowId)] ?? []) : [],
  )

  // ── PIM branch ───────────────────────────────────────────────────────────
  const pimProjectId = usePimStore((s) => s.currentProjectId)
  const pimProjects = usePimStore((s) => s.projects)
  const currentPath = useExcelStore((s) => s.currentPath)
  const currentFileName = useExcelStore((s) => s.currentFileName)
  /** Libellé du dossier/base cible de l'import — affiché dans le header.
   *  Mode PIM : nom du projet. Mode DataPage : chemin + base courante
   *  (le store PIM y est volontairement vide — garde anti-contamination). */
  const targetLabel = (() => {
    if (pimProjectId) {
      const p = pimProjects.find((pr) => pr.id === pimProjectId)
      if (p?.name) return p.name
    }
    const parts = [...(targetPath ?? currentPath ?? []), currentFileName].filter(Boolean) as string[]
    if (parts.length > 0) return parts.join(' › ')
    return null
  })()

  /** Coût LLM (USD) : dernier traitement + cumul depuis l'ouverture du modal.
   *  Alimenté par `recordAiUsage` via un listener actif tant que le modal est
   *  ouvert — couvre extraction Gemini, cascade generateJson, boost fabricant. */
  const [runCostUsd, setRunCostUsd] = useState(0)
  const [sessionCostUsd, setSessionCostUsd] = useState(0)
  const [costBySource, setCostBySource] = useState<Record<string, number>>({})
  useEffect(() => {
    if (!open) return
    // Observateur GLOBAL (et non listener de pile) : reçoit TOUS les coûts, y
    // compris les appels LLM routés par generateJson/llmRouter — qui poussaient
    // leur propre listener au sommet et masquaient le coût au badge (→ $0.0000).
    const unsubscribe = addUsageObserver(({ costUsd, source }) => {
      setRunCostUsd((c) => c + costUsd)
      setSessionCostUsd((c) => c + costUsd)
      const key = source && source !== 'gemini' && source !== 'claude' && source !== 'openai' ? source : 'llm'
      setCostBySource((m) => ({ ...m, [key]: (m[key] ?? 0) + costUsd }))
    })
    return unsubscribe
  }, [open])
  const COST_SOURCE_LABELS: Record<string, string> = { llm: 'LLM', jina: 'Jina', firecrawl: 'Firecrawl', brightdata: 'Bright Data' }
  const costBreakdown = Object.entries(costBySource)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${COST_SOURCE_LABELS[k] ?? k} $${v.toFixed(4)}`)
    .join(' · ')
  const products = usePimStore((s) => s.products)
  const selectedSourceIds = usePimStore((s) => s.selectedSourceIds)
  const upsertProducts = useUpsertProducts(pimProjectId ?? '')
  const upsertSource = useUpsertSource(pimProjectId ?? '')

  const [previewOpen, setPreviewOpen] = useState(false)
  const [pendingSource, setPendingSource] = useState<Source | null>(null)
  const [frozenPreview, setFrozenPreview] = useState<MergePreview | null>(null)

  const startPreview = (rows: Record<string, unknown>[], source: Source) => {
    setPendingSource(source)
    setFrozenPreview(matchRows(rows as never, products))
    setPreviewOpen(true)
  }

  const confirmIngest = async () => {
    if (!pimProjectId || !pendingSource || !frozenPreview) return
    try {
      const result = applyPreview(frozenPreview, products, pendingSource.id, { now: Date.now() })
      await upsertSource.mutateAsync(pendingSource)
      await upsertProducts.mutateAsync(result.products)
      toast.success(t('tst.merged', { created: result.stats.created, merged: result.stats.merged }))
      setPreviewOpen(false)
      setFrozenPreview(null)
      onClose()
    } catch (err) {
      console.error('[ScrapingModal] confirmIngest error', err)
      toast.error(t('tst.sc.importError', { message: err instanceof Error ? err.message : t('tst.unknownError') }))
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  if (!open) return null

  const urlValid = (() => { try { new URL(url); return true } catch { return false } })()
  const hostname = (() => { try { return new URL(url).hostname.replace('www.', '') } catch { return 'scraped' } })()
  /** Nom affichable de la source : marque détectée (« Milwaukee », « DeWalt »…)
   *  si reconnue depuis l'URL, sinon le hostname. Utilisé pour le chip header
   *  ET comme nom de feuille / fichier / source à l'import. */
  const displayName = (() => {
    const brand = url ? detectBrandLabelFromUrl(url) : null
    return brand ?? hostname
  })()
  /** Titre dérivé du slug URL : `caniveau-avec-grille-acier-heel-c250-l100-int-kenadrain` →
   *  `caniveau avec grille acier heel c250 l100 int kenadrain`. Ce même titre
   *  est passé à enrich() (input.title) et réutilisé comme nom de produit
   *  pour la colonne primary `name` de la sheet importée. */
  const productTitle = (() => {
    try {
      const path = new URL(url).pathname.split('/').filter(Boolean).pop() ?? ''
      return path.replace(/[-_]+/g, ' ').replace(/\.\w{2,4}$/, '').trim() || hostname
    } catch { return hostname }
  })()

  const handleScrape = async (mode: ScrapingMode, fields: ScrapingField[], prompt: string, opts: { target?: ExtractionTarget; waitFor?: number; noCache?: boolean; manualBreadcrumb?: string[] }) => {
    setRunCostUsd(0)
    // Mode "Produit unique" : route vers la pipeline d'enrichissement riche
    // (advantages groupés, variants table, specs communes) au lieu de l'extraction
    // Gemini → ligne plate. Les inputs schema/template/prompt sont ignorés ici :
    // on utilise le pipeline AUTO IA généraliste de useProductEnrichment.
    if (opts.target === 'single') {
      setResult(null)
      setLastFields([])
      // Reset de l'entrée précédente pour éviter d'afficher un résultat périmé
      clearEnrichEntry(SCRAPE_MODAL_SHEET, enrichRowId)
      resetEnrich(SCRAPE_MODAL_SHEET, enrichRowId)
      // Titre dérivé du slug URL — la pipeline le raffinera ensuite
      await enrich({
        sheetName: SCRAPE_MODAL_SHEET,
        rowId: enrichRowId,
        title: productTitle,
        knownUrl: url,
        mode: 'auto',
      })
      return
    }
    setResult(null)
    setLastFields(fields)
    // Fusionne l'instruction globale avec le prompt avancé de l'onglet (l'instruction
    // du haut est prioritaire) : source unique côté UI, deux consignes possibles côté LLM.
    const mergedPrompt = [instruction.trim(), prompt.trim()].filter(Boolean).join('\n')
    const res = await scrape(url, mode, fields, mergedPrompt, opts)
    if (res) setResult(res)
  }

  const handleMap = async (search?: string, rootUrl?: string): Promise<MapLink[] | null> => {
    const target = rootUrl ?? url
    setDiscoveryLogs([])
    const host = (() => { try { return new URL(target).hostname.replace(/^www\./, '') } catch { return target } })()
    pushDiscoveryLog(`Cartographie des liens sur ${host} (Map${search ? ` · « ${search} »` : ''})…`)
    const links = await map(target, search)
    pushDiscoveryLog(`${links?.length ?? 0} lien(s) cartographié(s)`)
    // Filtre par instruction avant enrichissement (fail-open, transparent).
    if (links && links.length > 0 && instruction.trim()) {
      pushDiscoveryLog(`Filtre IA « ${instruction.trim()} » sur ${links.length} lien(s)…`)
      const outcome = await filterByInstruction(links, instruction)
      if (outcome.applied) {
        pushDiscoveryLog(`✓ ${outcome.kept.length} retenu(s), ${outcome.excludedCount} exclu(s) par le filtre`)
        toast.success(t('tst.sc.filterKept', { label: instruction.trim(), kept: outcome.kept.length, excluded: outcome.excludedCount }))
      } else {
        pushDiscoveryLog(`⚠ Filtre non concluant — ${links.length} lien(s) conservé(s)`)
      }
      return outcome.kept
    }
    return links
  }

  /** Découvre les fiches produit d'une page de famille/catégorie via
   *  `discover()` (hook useJina) : moteur navigateur Jina (lazy-load rendu) →
   *  filtrage déterministe des liens par host + regex include/exclude, avec
   *  escalade Cloud Function Puppeteer (scroll) en filet. Plus d'échec
   *  silencieux : un toast explicite est levé si aucun produit n'est trouvé. */
  const handleCrawl = async (opts: { limit: number; includePaths: string; excludePaths: string }, rootUrl?: string) => {
    if (!rootUrl) { setRunCostUsd(0); setDiscoveryLogs([]) }
    const targetUrl = rootUrl ?? url
    // Si on est dans un loop multi-URL, on accumule plutôt qu'on reset
    if (!rootUrl) setCrawlPages([])

    const host = (() => { try { return new URL(targetUrl).hostname.replace(/^www\./, '') } catch { return targetUrl } })()
    pushDiscoveryLog(`Découverte des liens produit sur ${host} (crawl, limite ${opts.limit})…`)
    if (opts.includePaths) pushDiscoveryLog(`Filtre d'URL — inclure : ${opts.includePaths}`)
    if (opts.excludePaths) pushDiscoveryLog(`Filtre d'URL — exclure : ${opts.excludePaths}`)

    // Découverte DÉTERMINISTE (moteur navigateur Jina → lazy-load, puis escalade
    // Cloud Function Puppeteer qui scrolle). Plus de LLM ni d'échec silencieux.
    const { pages, source, error, diag } = await discover(targetUrl, {
      includePaths: opts.includePaths,
      excludePaths: opts.excludePaths,
      limit: opts.limit,
      instruction: instruction.trim() || undefined,
    })
    if (diag) pushDiscoveryLog(`Rendu par source — ${diag}`)

    if (pages.length === 0) {
      pushDiscoveryLog(`✗ Aucun lien produit détecté${error ? ` — ${error}` : ''}`)
      toast.error(error
        ? t('tst.sc.discoveryFailed', { message: error })
        : t('tst.sc.noProductFound'))
      if (!rootUrl) setCrawlPages([])
      return
    }
    const SRC_LABEL: Record<string, string> = { cards: 'grille produit', content: 'liens hors navigation', cloud: 'escalade scroll (Puppeteer)', firecrawl: 'cascade anti-bot (fetchPageHtml → Firecrawl → Bright Data)', jina: 'moteur Jina', none: 'aucune' }
    pushDiscoveryLog(`${pages.length} lien(s) découvert(s) · source : ${SRC_LABEL[source] ?? source}`)
    if (source === 'cards') {
      toast.success(t('tst.sc.gridDetected', { count: pages.length }))
    } else if (source === 'content') {
      toast.info(t('tst.sc.gridUnknown', { count: pages.length }))
    } else if (source === 'cloud') {
      toast.info(t('tst.sc.scrollEscalation', { count: pages.length }))
    } else if (source === 'firecrawl') {
      pushDiscoveryLog('⚠ Liens BRUTS (cascade anti-bot, non classifiés) — décoche les liens hors produit avant d\'enrichir, ou affine « Inclure (regex) » (ex. /p-).')
      toast.info(t('tst.sc.antibotCascade', { count: pages.length }))
    }
    // Log précis : liste des titres découverts (tronquée) + repère du terme cherché.
    const titles = pages.map((p) => p.title).filter(Boolean)
    pushDiscoveryLog(`Découverts (${titles.length}) : ${titles.slice(0, 40).join(' · ')}${titles.length > 40 ? ' …' : ''}`)
    const needle = instruction.trim().toLowerCase().replace(/^\d+\s*/, '')
    if (needle) {
      const hits = titles.filter((t) => t.toLowerCase().includes(needle) || (needle.length > 4 && t.toLowerCase().includes(needle.slice(0, 5))))
      pushDiscoveryLog(hits.length
        ? `« ${needle} » apparaît dans ${hits.length} titre(s) découvert(s) : ${hits.slice(0, 12).join(' · ')}`
        : `⚠ « ${needle} » n'apparaît dans AUCUN des ${titles.length} titres découverts — le produit n'est pas dans ce que la page a rendu (pagination/API ?).`)
    }

    // Filtre IA AVANT l'enrichissement coûteux. Deux cas :
    //  • Instruction utilisateur (« que des perforateurs ») → filtre ciblé.
    //  • Liens BRUTS de la cascade anti-bot sans instruction → filtre PRODUIT par
    //    défaut (exclut catégories/nav/footer, garde les fiches produit).
    // Transparent + fail-open (jamais de cull silencieux vers zéro).
    let kept = pages
    const rawSource = source === 'firecrawl'
    const userInstr = instruction.trim()
    const effInstruction = userInstr || (rawSource ? 'toute fiche produit (n\'importe quel produit)' : '')
    if (effInstruction) {
      const label = userInstr || 'fiches produit uniquement'
      pushDiscoveryLog(`Filtre IA « ${label} » sur ${pages.length} lien(s)…`)
      const outcome = await filterByInstruction(pages, effInstruction)
      kept = outcome.kept
      if (outcome.applied && kept.length === 0) {
        pushDiscoveryLog(`✗ Aucun lien ne correspond à « ${label} » parmi les ${pages.length} découverts. La grille n'a peut-être rendu qu'une partie des produits (anti-bot sans défilement) — essaie une sous-catégorie plus ciblée ou augmente la limite.`)
        toast.info(t('tst.sc.filterNoMatch', { label, count: pages.length }))
      } else if (outcome.applied) {
        pushDiscoveryLog(`✓ ${kept.length} retenu(s), ${outcome.excludedCount} exclu(s) : ${kept.map((p) => p.title).slice(0, 20).join(' · ')}`)
        toast.success(t('tst.sc.filterKeptShort', { label, kept: kept.length, excluded: outcome.excludedCount }))
      } else {
        pushDiscoveryLog(`⚠ Filtre non concluant (IA indisponible ou 0 correspondance) — ${pages.length} lien(s) conservé(s)`)
        toast.info(t('tst.sc.filterInconclusive', { count: pages.length }))
      }
    }

    // Multi-URL : accumule, dédoublonne par URL absolue.
    setCrawlPages((prev) => {
      if (!rootUrl) return kept
      const merged = [...prev]
      const seen = new Set(prev.map((p) => p.url))
      for (const p of kept) {
        if (!seen.has(p.url)) { merged.push(p); seen.add(p.url) }
      }
      return merged
    })
  }

  /** Dérive un titre lisible depuis l'URL (slug → "produit xyz"). */
  const deriveTitleFromUrl = (u: string): string => {
    try {
      const path = new URL(u).pathname.split('/').filter(Boolean).pop() ?? ''
      return path.replace(/[-_]+/g, ' ').replace(/\.\w{2,4}$/, '').trim() || new URL(u).hostname
    } catch { return u }
  }

  /** Dérive un rowId stable et unique pour chaque URL du batch (préfixe par
   *  index pour éviter les collisions sur slugs tronqués similaires). */
  const deriveBatchRowId = (u: string, i: number): string => {
    let slug = ''
    try { slug = new URL(u).pathname.replace(/[^a-z0-9]/gi, '_').slice(0, 60) }
    catch { slug = 'pending' }
    return `batch_${i}_${slug || 'item'}`
  }

  /** Lance la pipeline `enrich()` (Produit complet) sur N URLs séquentiellement.
   *  Mise à jour de `batch` après chaque produit pour un feedback live. */
  const handleEnrichMany = async (urls: string[]) => {
    if (urls.length === 0) return
    setRunCostUsd(0)
    batchAbortRef.current = false
    setBatchAborting(false)
    setResult(null)
    setBatchRunning(true)
    setBatchCurrentIdx(null)

    // Initialise les items dans l'ordre — UI visible pendant le run
    const initial: BatchItem[] = urls.map((u, i) => ({
      url: u,
      title: deriveTitleFromUrl(u),
      rowId: deriveBatchRowId(u, i),
      status: 'pending',
    }))
    setBatch(initial)
    const doneNames: string[] = []

    try {
      for (let i = 0; i < initial.length; i++) {
        if (batchAbortRef.current) break
        setBatchCurrentIdx(i)
        const item = initial[i]
        setBatch((prev) => prev.map((b, idx) => (idx === i ? { ...b, status: 'running' } : b)))

        try {
          const product = await enrich({
            sheetName: SCRAPE_MODAL_SHEET,
            rowId: item.rowId,
            title: item.title,
            knownUrl: item.url,
            mode: 'auto',
          })
          // Si une annulation a été demandée pendant cet enrich(), rejette le
          // résultat : l'utilisateur attend que ça s'arrête, on ne garde pas
          // ce produit qui n'aurait jamais existé sans le délai d'annulation.
          if (batchAbortRef.current) {
            setBatch((prev) => prev.map((b, idx) =>
              idx === i ? { ...b, status: 'failed', error: 'Annulé' } : b
            ))
          } else if (product) {
            if (product.name?.trim()) doneNames.push(product.name.trim().toLowerCase())
            setBatch((prev) => prev.map((b, idx) =>
              idx === i ? { ...b, status: 'done', product } : b
            ))
            // Auto-sélectionne le premier produit terminé pour aperçu live
            setBatchPreviewIdx((prev) => (prev === null ? i : prev))
          } else {
            setBatch((prev) => prev.map((b, idx) =>
              idx === i ? { ...b, status: 'failed', error: 'Aucun produit extrait' } : b
            ))
          }
        } catch (e) {
          setBatch((prev) => prev.map((b, idx) =>
            idx === i ? { ...b, status: 'failed', error: batchAbortRef.current ? 'Annulé' : (e instanceof Error ? e.message : 'Erreur') } : b
          ))
        }

        // Léger rate-limit Jina (cohérent avec extract())
        if (i < initial.length - 1 && !batchAbortRef.current) await new Promise((r) => setTimeout(r, 500))
      }
    } finally {
      setBatchCurrentIdx(null)
      setBatchRunning(false)
      setBatchAborting(false)
    }

    // Garde-fou qualité : si plusieurs fiches partagent exactement le même
    // nom extrait, les URLs enrichies étaient très probablement des pages
    // catégorie (menu/hub), pas des fiches produit — prévenir AVANT l'import.
    const dupCount = doneNames.length - new Set(doneNames).size
    if (dupCount > 0) {
      toast.warning(t('tst.sc.duplicateNames', { count: dupCount + 1 }))
    }
  }

  const abortBatch = () => {
    batchAbortRef.current = true
    setBatchAborting(true)
    abort() // interrompt les requêtes Jina/scrape qui acceptent un signal
    // Feedback instantané : marque tous les items 'pending' comme annulés.
    // L'item 'running' continue (enrich() n'accepte pas d'AbortSignal) — son
    // résultat sera ignoré à la fin de l'itération via le check batchAbortRef.
    setBatch((prev) => prev.map((b) =>
      b.status === 'pending' ? { ...b, status: 'failed', error: 'Annulé' } : b
    ))
  }

  /** Normalise une valeur de clé pour la comparaison (trim, lowercase, strip). */
  const normalizeKey = (v: unknown): string => {
    if (v == null) return ''
    const s = String(v).trim().toLowerCase()
    return s
  }

  /** Merge `next` dans `prev` (même domaine re-scrapé). Union des colonnes
   *  (prev en premier, nouvelles colonnes ajoutées à la fin).
   *  Stratégie ligne :
   *   - Si une colonne `isPrimary` existe dans `prev` et que la valeur de cette
   *     clé dans une ligne `next` matche une ligne `prev` → UPDATE en place
   *     (préserve le `_id` et fusionne les nouveaux champs).
   *   - Sinon → append avec un `_id` rebasé pour éviter les collisions.
   *   La taxonomie est reconstruite après merge. */
  const appendSheetRows = (prev: ExcelSheet, next: ExcelSheet): ExcelSheet => {
    const prevKeys = new Set(prev.columns.map((c) => c.key))
    const addedColumns = next.columns.filter((c) => !prevKeys.has(c.key))
    const columns = [...prev.columns, ...addedColumns]

    const primaryCol = prev.columns.find((c) => c.isPrimary)
    const primaryKey = primaryCol?.key

    let mergedRows: ExcelRow[]
    if (primaryKey) {
      // Index les lignes prev par valeur de clé primaire (seulement quand non vide).
      const prevByKey = new Map<string, number>()
      prev.rows.forEach((r, idx) => {
        const k = normalizeKey(r[primaryKey])
        if (k) prevByKey.set(k, idx)
      })
      mergedRows = [...prev.rows]
      let appendCount = 0
      for (const nr of next.rows) {
        const k = normalizeKey(nr[primaryKey])
        const matchIdx = k ? prevByKey.get(k) : undefined
        if (matchIdx !== undefined) {
          // UPDATE : fusionne les champs, préserve l'_id existant.
          const existing = mergedRows[matchIdx]
          mergedRows[matchIdx] = { ...existing, ...nr, _id: existing._id }
        } else {
          // APPEND : nouvel _id pour éviter la collision.
          mergedRows.push({ ...nr, _id: `scraped_${prev.rows.length + appendCount}` })
          appendCount++
        }
      }
    } else {
      // Pas de clé primaire → append systématique.
      const offset = prev.rows.length
      const rebased = next.rows.map((r, i) => ({ ...r, _id: `scraped_${offset + i}` }))
      mergedRows = [...prev.rows, ...rebased]
    }

    const taxonomyLevels = prev.taxonomyLevels ?? next.taxonomyLevels
    const sheet: ExcelSheet = { ...prev, columns, rows: mergedRows, taxonomy: [] }
    if (taxonomyLevels) {
      sheet.taxonomyLevels = taxonomyLevels
      sheet.taxonomy = buildTaxonomyFromLevels(sheet, taxonomyLevels)
    }
    return sheet
  }

  /** Stratégie :
   *  1. Si une feuille porte déjà ce nom → AJOUT des nouvelles lignes en fin
   *     de la feuille existante (préserve les produits déjà scrapés).
   *  2. Si la seule feuille présente est vide (0 ligne, créée par « Creer vide »)
   *     → on la remplace plutôt que d'ajouter un onglet orphelin à côté.
   *  3. Sinon → ajout en fin. */
  const mergeSheet = (existing: ExcelSheet[], next: ExcelSheet): { sheets: ExcelSheet[]; activeIndex: number } => {
    const existingIdx = existing.findIndex((s) => s.name === next.name)
    if (existingIdx >= 0) {
      const merged = [...existing]
      merged[existingIdx] = appendSheetRows(existing[existingIdx], next)
      return { sheets: merged, activeIndex: existingIdx }
    }
    if (existing.length === 1 && existing[0].rows.length === 0) {
      return { sheets: [next], activeIndex: 0 }
    }
    return { sheets: [...existing, next], activeIndex: existing.length }
  }

  /** Lance la classification IA en lot sur les rowIds nouvellement importés
   *  vers la taxonomie sélectionnée. Fire-and-forget : la classification
   *  continue après fermeture du modal (le store reçoit les updateCell). */
  const triggerAutoClassify = (rowIds: string[]) => {
    if (!importTaxoId || rowIds.length === 0 || !taxonomies) return
    const target = taxonomies.find((t) => t.id === importTaxoId)
    if (!target) return
    void bulkAttach.run(target, { minConfidence: 0.5, overwriteLinked: true, rowIds })
  }

  const handleImportResult = () => {
    if (!result) return
    if (pimProjectId) {
      const source: Source = resyncSource
        ? { ...resyncSource, productCount: result.rows.length, lastSyncedAt: Date.now() }
        : {
            id: `src_${hostname}_${Date.now()}`,
            name: displayName,
            kind: 'scrape',
            url,
            schema: scrapeResultToColumns(result, lastFields),
            productCount: result.rows.length,
            enrichedCount: 0,
            lastSyncedAt: Date.now(),
          }
      startPreview(result.rows as Record<string, unknown>[], source)
      return
    }
    const sheet = scrapeResultToSheet(result, lastFields, displayName, url)
    const newRowIds = sheet.rows.map((r) => r._id)
    const store = useExcelStore.getState()
    // Scrape depuis le bouton "+" (targetPath défini) → nouvelle BDD :
    // reset docId et remplace les feuilles au lieu d'ajouter un onglet.
    if (targetPath !== undefined) {
      store.setCurrentDocId(null)
      store.setSheetRowId(null)
      setCurrentFileName(displayName)
      setCurrentPath(targetPath)
      setSheets([sheet])
      store.setActiveSheet(0)
    } else {
      // Préserver les feuilles existantes : remplacer l'onglet de même nom
      // (re-scrape du même domaine) ou ajouter un nouvel onglet.
      const { sheets: merged, activeIndex } = mergeSheet(sheets, sheet)
      setSheets(merged)
      store.setActiveSheet(activeIndex)
      store.setSheetRowId(null)
      if (sheets.length === 0) {
        setCurrentFileName(displayName)
      }
    }
    triggerAutoClassify(newRowIds)
    // Opt-in : centraliser automatiquement les images dans le DAM après import
    // (détaché — la migration tourne même si la modale se ferme).
    if (autoDam) void migrateActiveSheet({ silent: true })
    handleClose()
  }

  const handleImportEnriched = () => {
    if (!enrichEntry?.data) return
    if (pimProjectId) {
      const enrichedColumns = [
        { key: 'name', label: 'Nom', fieldType: 'text' as const, detectedType: 'text' as const, isPrimary: true, width: 240 },
        ...ENRICHMENT_COLUMNS.map(buildEnrichmentColumn),
      ]
      const serialized = serializeEnriched(enrichEntry.data, null)
      const row: Record<string, unknown> = { _id: 'enriched_0', name: productTitle, ...serialized }
      const source: Source = resyncSource
        ? { ...resyncSource, productCount: 1, enrichedCount: 1, lastSyncedAt: Date.now() }
        : {
            id: `src_${hostname}_${Date.now()}`,
            name: displayName,
            kind: 'scrape',
            url,
            schema: enrichedColumns,
            productCount: 1,
            enrichedCount: 1,
            lastSyncedAt: Date.now(),
          }
      startPreview([row], source)
      return
    }
    const sheet = enrichedProductToSheet(enrichEntry.data, displayName, productTitle)
    const newRowIds = sheet.rows.map((r) => r._id)
    const store = useExcelStore.getState()
    if (targetPath !== undefined) {
      store.setCurrentDocId(null)
      store.setSheetRowId(null)
      setCurrentFileName(displayName)
      setCurrentPath(targetPath)
      setSheets([sheet])
      store.setActiveSheet(0)
    } else {
      const { sheets: merged, activeIndex } = mergeSheet(sheets, sheet)
      setSheets(merged)
      store.setActiveSheet(activeIndex)
      store.setSheetRowId(null)
      if (sheets.length === 0) {
        setCurrentFileName(displayName)
      }
    }
    // Option « + fabricant » : ouvrir la fiche du produit importé et y auto-lancer
    // la « Vérification Fabricant » (le rowId réel n'existe qu'ici, après import).
    if (verifyAfterImport && newRowIds[0]) {
      store.setSheetRowId(newRowIds[0])
      store.setPendingMfrVerifyRowId(newRowIds[0])
    }
    triggerAutoClassify(newRowIds)
    if (autoDam) void migrateActiveSheet({ silent: true })
    handleClose()
  }

  const handleImportBatch = () => {
    const successful = batch.filter((b) => b.product)
    if (successful.length === 0) return
    const products = successful.map((b) => b.product!) as EnrichedProduct[]
    const titles = successful.map((b) => b.product?.name || b.title)

    if (pimProjectId) {
      const enrichedColumns = [
        { key: 'name', label: 'Nom', fieldType: 'text' as const, detectedType: 'text' as const, isPrimary: true, width: 240 },
        ...ENRICHMENT_COLUMNS.map(buildEnrichmentColumn),
      ]
      const rows = products.map((product, i) => {
        const serialized = serializeEnriched(product, null)
        return { _id: `enriched_${i}`, name: titles[i], ...serialized } as Record<string, unknown>
      })
      const source: Source = resyncSource
        ? { ...resyncSource, productCount: products.length, enrichedCount: products.length, lastSyncedAt: Date.now() }
        : {
            id: `src_${hostname}_${Date.now()}`,
            name: displayName,
            kind: 'scrape',
            url,
            schema: enrichedColumns,
            productCount: products.length,
            enrichedCount: products.length,
            lastSyncedAt: Date.now(),
          }
      startPreview(rows, source)
      return
    }

    const sheet = enrichedProductsToSheet(products, displayName, titles)
    const newRowIds = sheet.rows.map((r) => r._id)
    const store = useExcelStore.getState()
    if (targetPath !== undefined) {
      store.setCurrentDocId(null)
      store.setSheetRowId(null)
      setCurrentFileName(displayName)
      setCurrentPath(targetPath)
      setSheets([sheet])
      store.setActiveSheet(0)
    } else {
      const { sheets: merged, activeIndex } = mergeSheet(sheets, sheet)
      setSheets(merged)
      store.setActiveSheet(activeIndex)
      store.setSheetRowId(null)
      if (sheets.length === 0) {
        setCurrentFileName(displayName)
      }
    }
    triggerAutoClassify(newRowIds)
    if (autoDam) void migrateActiveSheet({ silent: true })
    handleClose()
  }

  const handleClose = () => {
    abort()
    batchAbortRef.current = true
    setResult(null)
    setCrawlPages([])
    // Nettoie les entrées du store enrichmentStore créées par le batch
    for (const item of batch) {
      clearEnrichEntry(SCRAPE_MODAL_SHEET, item.rowId)
    }
    setBatch([])
    setBatchRunning(false)
    setBatchAborting(false)
    setBatchPreviewIdx(null)
    setUrl('')
    setPreviewOpen(false)
    setFrozenPreview(null)
    clearEnrichEntry(SCRAPE_MODAL_SHEET, enrichRowId)
    onClose()
  }

  /** Rail de logs à droite : seulement en Crawl/Map, quand il y a des logs. */
  const showRightLogs = (tab === 'crawl' || tab === 'map') && discoveryLogs.length > 0
  const canImport = result && result.rows.length > 0
  const canImportEnriched = tab === 'scrape' && !!enrichEntry?.data && !enriching
  const successfulBatchCount = batch.filter((b) => b.product).length
  const canImportBatch = successfulBatchCount > 0 && !batchRunning

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`bg-well border border-white/10 rounded-2xl w-full ${tab === 'search' ? 'max-w-4xl' : showRightLogs ? 'max-w-7xl' : 'max-w-2xl'} max-h-[90vh] flex flex-col shadow-2xl transition-[max-width] duration-200`}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Globe className="w-4 h-4 text-indigo-400 shrink-0" />
            <h2 className="text-sm font-semibold text-white/80 shrink-0">Web Scraping</h2>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
              Jina AI
            </span>
            {targetLabel && (
              <span
                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 shrink-0 max-w-[160px]"
                title={t('sc.import.target', { target: targetLabel })}
              >
                <Folder className="w-3 h-3 shrink-0" />
                <span className="truncate">{targetLabel}</span>
              </span>
            )}
            <span
              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 shrink-0"
              title={t('sc.cost.title', { run: runCostUsd.toFixed(4), session: sessionCostUsd.toFixed(4), breakdown: costBreakdown ? `\n${costBreakdown}` : '' })}
            >
              <Coins className="w-3 h-3 shrink-0" />
              ${runCostUsd.toFixed(runCostUsd < 0.01 ? 4 : 2)}
              <span className="text-emerald-300/50">· Σ ${sessionCostUsd.toFixed(sessionCostUsd < 0.01 ? 4 : 2)}</span>
            </span>
            {(() => {
              // Mode PIM : affiche source sélectionnée depuis SheetsColumn
              if (selectedSourceIds.length > 0) {
                const sourceId = selectedSourceIds[0]
                const className = "inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-indigo-300 hover:border-indigo-500/30 hover:bg-indigo-500/10 transition-colors truncate max-w-[280px]"
                return (
                  <span className={className} title={`Source : ${sourceId}`}>
                    <span className="truncate">{sourceId}</span>
                  </span>
                )
              }
              // Mode Scraping classique : affiche URL avec lien
              if (urlValid) {
                return (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-indigo-300 hover:border-indigo-500/30 hover:bg-indigo-500/10 transition-colors truncate max-w-[280px]"
                    title={`Ouvrir la source : ${url}`}
                  >
                    <span className="truncate">{displayName}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                )
              }
              return null
            })()}
          </div>
          <CloseButton onClick={handleClose} className="shrink-0" />
        </div>

        {/* URL input */}
        <div className="px-5 py-3 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 focus-within:border-indigo-500/50 transition-colors">
            <Globe className="w-3.5 h-3.5 text-white/20 shrink-0" />
            <input
              type="url" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://exemple.com"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-white/20 outline-none"
              onKeyDown={(e) => e.key === 'Enter' && urlValid && tab === 'scrape' && handleScrape('schema', [], '', {})}
            />
          </div>
        </div>

        {/* Instruction en langage naturel (sauf onglet Recherche qui EST déjà un prompt).
             Filtre les découvertes Crawl/Map et oriente l'extraction. */}
        {tab !== 'search' && (
          <div className="px-5 py-3 border-b border-white/[0.06] shrink-0">
            <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 focus-within:border-indigo-500/50 transition-colors">
              <Sparkles className="w-3.5 h-3.5 text-indigo-300/70 shrink-0" />
              <input
                type="text" value={instruction} onChange={(e) => setInstruction(e.target.value)}
                placeholder="Instruction (optionnel) — ex. ne garder que les perceuses Makita"
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 outline-none"
              />
              {instruction && (
                <button onClick={() => setInstruction('')} className="text-white/25 hover:text-white/60 shrink-0" title="Effacer">
                  <span className="text-xs">✕</span>
                </button>
              )}
            </div>
            {(tab === 'crawl' || tab === 'map') && instruction.trim() && (
              <p className="mt-1.5 text-[10px] text-white/35">
                Les produits découverts seront filtrés selon cette instruction (rien n'est jeté en silence : le compte exclu est affiché).
              </p>
            )}
          </div>
        )}

        {/* Opt-in DAM : centraliser les images dans Google Drive après l'import. */}
        <label className="px-5 py-2.5 border-b border-white/[0.06] shrink-0 flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoDam}
            onChange={(e) => {
              setAutoDam(e.target.checked)
              localStorage.setItem('dam.autoCentralize', e.target.checked ? '1' : '0')
            }}
            className="accent-indigo-500 shrink-0"
          />
          <FolderUp className="w-3.5 h-3.5 text-white/30 shrink-0" />
          <span className="text-[11px] text-white/45">{t('sc.dam.centralise')}</span>
        </label>

        {/* Auto-classement IA — taxonomie cible (optionnelle).
             Si renseignée, chaque produit importé est classé automatiquement
             dans le bon nœud après la fin du scrape. */}
        {taxonomies && taxonomies.length > 0 && (
          <div className="px-5 py-2.5 border-b border-white/[0.06] shrink-0 flex items-center gap-2">
            <Tag className="w-3.5 h-3.5 text-white/30 shrink-0" />
            <span className="text-[11px] text-white/45 shrink-0">Auto-classer dans</span>
            <select
              value={importTaxoId}
              onChange={(e) => setImportTaxoId(e.target.value)}
              className="flex-1 bg-black/30 border border-white/10 rounded-md px-2 py-1 text-[11px] text-white/75 outline-none focus:border-indigo-500/50 transition-colors cursor-pointer"
              title={t('sc.taxonomy.auto')}
            >
              <option value="" className="bg-surface">— Pas d'auto-classement</option>
              {taxonomies.map((t) => {
                const count = Object.keys(t.nodes).length
                return (
                  <option key={t.id} value={t.id} className="bg-surface">
                    {t.name} ({count} nœuds)
                  </option>
                )
              })}
            </select>
            {importTaxoId && (
              <span className="text-[10px] text-indigo-300/70 shrink-0">IA</span>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-white/[0.06] shrink-0">
          {TABS.map(({ id, label, Icon, color }) => (
            <button
              key={id}
              onClick={() => {
                setTab(id)
                setResult(null)
                // Réinitialise le batch lors du changement d'onglet (évite la
                // confusion : batch Map+Extract qui reste visible en passant à Crawl).
                if (!batchRunning) {
                  for (const item of batch) clearEnrichEntry(SCRAPE_MODAL_SHEET, item.rowId)
                  setBatch([])
                  setBatchPreviewIdx(null)
                }
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                tab === id ? `${color} border-b-2 border-current` : 'text-white/30 hover:text-white/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Body : colonne principale (gauche) + rail de logs (droite) en Crawl/Map */}
        <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 min-w-0 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          {tab === 'scrape' && (
            <ScrapeTab
              url={urlValid ? url : ''}
              loading={loading || enriching}
              onScrape={handleScrape}
              onUrlSuggestion={(suggested) => setUrl(suggested)}
              onEnrichMany={handleEnrichMany}
              batchRunning={batchRunning}
              logs={batchRunning ? [] : enrichLogs}
            />
          )}
          {tab === 'map' && (
            <MapExtractTab
              url={urlValid ? url : ''}
              loading={loading}
              onMap={handleMap}
              onEnrichMany={handleEnrichMany}
              batchRunning={batchRunning}
              onUrlSuggestion={(suggested) => setUrl(suggested)}
            />
          )}
          {tab === 'search' && (
            <SearchTab
              onEnrichMany={handleEnrichMany}
              batchRunning={batchRunning}
              products={batch.flatMap((b) => (b.product ? [b.product] : []))}
            />
          )}
          {tab === 'crawl' && (
            <CrawlTab
              url={urlValid ? url : ''}
              loading={loading}
              pages={crawlPages}
              onCrawl={handleCrawl}
              onAbort={abort}
              onEnrichMany={handleEnrichMany}
              batchRunning={batchRunning}
              onUrlSuggestion={(suggested) => setUrl(suggested)}
            />
          )}


          {/* Progression du batch d'enrichissement multi-URLs (tous tabs incluant scrape) */}
          {batch.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-white/50">
                    Enrichissement {batch.filter((b) => b.status === 'done' || b.status === 'failed').length} / {batch.length}
                  </span>
                  {successfulBatchCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300/80 border border-emerald-500/20">
                      {successfulBatchCount} OK
                    </span>
                  )}
                  {batch.filter((b) => b.status === 'failed').length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-300/80 border border-red-500/20">
                      {batch.filter((b) => b.status === 'failed').length} échec(s)
                    </span>
                  )}
                </div>
                {batchRunning && !batchAborting && (
                  <button
                    onClick={abortBatch}
                    className="text-[11px] text-red-400/70 hover:text-red-400 transition-colors"
                  >
                    Annuler
                  </button>
                )}
                {batchAborting && (
                  <span className="flex items-center gap-1.5 text-[10px] text-amber-400/80">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Annulation… (attente fin de l'item courant)
                  </span>
                )}
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${(batch.filter((b) => b.status === 'done' || b.status === 'failed').length / batch.length) * 100}%` }}
                />
              </div>
              {/* Item courant : reflète le progress du store enrichment */}
              {batchRunning && batchCurrentIdx !== null && (() => {
                const item = batch[batchCurrentIdx]
                if (!item) return null
                const entry = allEntries[enrichmentKey(SCRAPE_MODAL_SHEET, item.rowId)]
                return (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-indigo-500/5 border border-indigo-500/20">
                    <Loader2 className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5 animate-spin" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-indigo-300/90 font-medium truncate">{item.title}</p>
                      <p className="text-[10px] text-white/40 truncate">{entry?.progress?.message ?? 'En attente…'}</p>
                    </div>
                  </div>
                )
              })()}
              {/* Console de logs — affichée une seule fois pour tout le batch */}
              {batchCurrentLogs.length > 0 && (
                <TypedLogConsole logs={batchCurrentLogs} maxHeight="16rem" />
              )}
              {/* Liste cliquable des items — masquée quand 1 seul (item card suffit) */}
              {batch.length > 1 && (
              <div className="max-h-48 overflow-y-auto space-y-0.5 border border-white/[0.06] rounded-lg p-1">
                {batch.map((item, i) => {
                  const isPreviewed = batchPreviewIdx === i
                  const clickable = item.status === 'done' && !!item.product
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => clickable && setBatchPreviewIdx(i)}
                      disabled={!clickable}
                      className={`w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] text-left transition-colors ${
                        isPreviewed
                          ? 'bg-indigo-500/15 ring-1 ring-indigo-500/30'
                          : item.status === 'running'
                            ? 'bg-indigo-500/10'
                            : clickable
                              ? 'hover:bg-white/[0.04] cursor-pointer'
                              : 'cursor-default'
                      }`}
                    >
                      {item.status === 'pending' && <span className="w-2 h-2 rounded-full bg-white/15 shrink-0" />}
                      {item.status === 'running' && <Loader2 className="w-3 h-3 text-indigo-400 shrink-0 animate-spin" />}
                      {item.status === 'done' && <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />}
                      {item.status === 'failed' && <AlertCircle className="w-3 h-3 text-red-400/70 shrink-0" />}
                      <span className={`truncate flex-1 ${item.status === 'failed' ? 'text-red-300/60' : 'text-white/60'}`} title={item.url}>
                        {item.product?.name || item.title}
                      </span>
                      {item.status === 'failed' && item.error && (
                        <span className="text-[9px] text-red-400/50 truncate max-w-[120px]" title={item.error}>{item.error}</span>
                      )}
                    </button>
                  )
                })}
              </div>
              )}

              {/* Aperçu détaillé du produit sélectionné — même rendu que Scrape/Produit unique */}
              {batchPreviewIdx !== null && batch[batchPreviewIdx]?.product && (
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.01] p-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/30">
                      <Sparkles className="w-3 h-3 text-violet-400/70" />
                      Aperçu
                      <span className="font-mono text-white/40 normal-case">
                        {batchPreviewIdx + 1} / {successfulBatchCount}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          // Précédent produit réussi
                          for (let k = batchPreviewIdx - 1; k >= 0; k--) {
                            if (batch[k].product) { setBatchPreviewIdx(k); return }
                          }
                        }}
                        className="text-[11px] px-2 py-0.5 rounded text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
                      >
                        ← Précédent
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          for (let k = batchPreviewIdx + 1; k < batch.length; k++) {
                            if (batch[k].product) { setBatchPreviewIdx(k); return }
                          }
                        }}
                        className="text-[11px] px-2 py-0.5 rounded text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
                      >
                        Suivant →
                      </button>
                    </div>
                  </div>
                  <p className="text-[13px] font-semibold text-white/90 mb-3 truncate" title={batch[batchPreviewIdx].product?.name}>
                    {batch[batchPreviewIdx].product?.name || batch[batchPreviewIdx].title}
                  </p>
                  <ProductEnrichedView product={batch[batchPreviewIdx].product!} />
                </div>
              )}
            </div>
          )}

          {tab === 'scrape' && enrichEntry?.error && !enriching && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{enrichEntry.error}</p>
            </div>
          )}
          {tab === 'scrape' && enrichEntry?.data && (
            <ProductEnrichedView product={enrichEntry.data} />
          )}

          {result && <ScrapingPreview result={result} />}
        </div>

        {/* Rail de logs à droite : phase découverte + filtre (Crawl/Map). */}
        {showRightLogs && (
          <div className="w-[28rem] shrink-0 border-l border-white/[0.06] bg-black/20 overflow-y-auto p-3">
            <TypedLogConsole logs={discoveryLogs} maxHeight="none" />
          </div>
        )}
        </div>

        {/* Footer */}
        {(canImport || canImportEnriched || canImportBatch) && (
          <div className="px-5 py-3.5 border-t border-white/[0.06] shrink-0">
            {canImportEnriched && !pimProjectId && (
              <label className="flex items-center gap-2 mb-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={verifyAfterImport}
                  onChange={(e) => setVerifyAfterImport(e.target.checked)}
                  className="accent-indigo-500 w-3.5 h-3.5"
                />
                <span className="text-[12px] text-white/60">
                  {t('sc.compareManufacturerFull')}
                </span>
              </label>
            )}
            <button
              onClick={() => {
                if (canImportBatch) return handleImportBatch()
                if (canImportEnriched) return handleImportEnriched()
                return handleImportResult()
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              {canImportBatch
                ? `Importer ${successfulBatchCount} produit${successfulBatchCount > 1 ? 's' : ''} enrichi${successfulBatchCount > 1 ? 's' : ''}`
                : canImportEnriched
                  ? 'Importer le produit enrichi'
                  : `Importer ${result?.rows.length} ligne${(result?.rows.length ?? 0) > 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </div>
    </div>

    {pendingSource && (
      <MatchPreviewModal
        open={previewOpen}
        preview={frozenPreview}
        loading={false}
        sourceName={pendingSource.name}
        onConfirm={confirmIngest}
        onClose={() => { setPreviewOpen(false); setFrozenPreview(null) }}
      />
    )}
    </>
  )
}
