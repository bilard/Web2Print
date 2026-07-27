// Panneau de config du node « Sites sources » : tableau de gestion des sites
// concurrents avec stats persistées LIVE (useCompetitorMeta + useCatalogReport,
// onSnapshot — indépendant de tout run). Clé de lecture = watchId dérivé comme au
// runtime (config sinon id du workflow courant).
import { useEffect, useMemo, useState } from 'react'
import { Plus, ClipboardPaste, Search, X, Trash2, CheckSquare, Square } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { useWorkflowStore } from '../persistence/workflow.store'
import { useCompetitorMeta, useCatalogReport } from '@/features/priceWatch/useCatalogReport'
import { stableId } from '@/features/priceWatch/core'
import { harvestOneSite } from '@/features/priceWatch/catalog/runSingleSite'
import { resetCompetitorData } from '@/features/priceWatch/catalog/store'
import { recomputeReport } from '@/features/priceWatch/catalog/recomputeReport'
import {
  normalizeDomain, deriveWatchId, importSitesIntoRows, siteStatus, siteStatusRank, HARVEST_LIVE_WINDOW_MS,
  rowsToCompetitorSites, type SourceSiteRow, type SiteStatus,
} from '@/features/priceWatch/sourceSites'
import { SourceSitesRowItem, type SiteRowStats } from './sourceSitesRow'
import { SiteCredentialsForm } from './sourceSitesCreds'
import { PurgeScrapingPanel } from './sourceSitesPurge'
import type { SourceSitesNodeConfig } from './sourceSitesTypes'

/** Fenêtre du battement de moisson : constante PARTAGÉE avec la PWA radarPrice — deux
 *  valeurs différentes affichaient des comptes contradictoires d'un écran à l'autre. */
const LIVE_WINDOW_MS = HARVEST_LIVE_WINDOW_MS

type SortMode = 'manual' | 'status' | 'products'
const SORT_LABELS: Record<SortMode, string> = {
  manual: 'Sans tri', status: 'Par statut', products: 'Par produits',
}

export function SourceSitesConfig({ config, onChange }: {
  config: SourceSitesNodeConfig
  onChange: (next: SourceSitesNodeConfig) => void
  availableColumns?: string[]
}) {
  const workflowId = useWorkflowStore((s) => s.current?.id)
  const uid = useAuthStore((s) => s.user?.uid)
  const rows = useMemo(() => config.sites ?? [], [config.sites])
  const watchId = deriveWatchId(config.watchId ?? '', workflowId)
  const metaMap = useCompetitorMeta(watchId)
  const report = useCatalogReport(watchId)

  // Horloge partagée (tick 30 s) : rafraîchit « scrape il y a X » et l'état live
  // même sans écriture Firestore (le heartbeat vieillit → le surlignage s'éteint).
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const [draft, setDraft] = useState('')
  const [importing, setImporting] = useState(false)
  const [importText, setImportText] = useState('')
  const [sort, setSort] = useState<SortMode>('manual')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<SiteStatus | null>(null)
  const [credsRow, setCredsRow] = useState<number | null>(null)
  const [scrapingId, setScrapingId] = useState<string | null>(null)
  const [purging, setPurging] = useState(false)

  // Moisson manuelle d'UN site (bouton ▶) : réutilise le moteur, budget court (test),
  // met à jour le tableau en direct (onSnapshot). Le domaine sert de clé de « en cours ».
  const scrapeSite = async (r: SourceSiteRow) => {
    const domain = normalizeDomain(r.domain)
    if (!uid || !domain) return
    // Construit le CompetitorSite comme à l'émission (engine forcé / auth / champs).
    const site = rowsToCompetitorSites([{ ...r, enabled: true }])[0]
    if (!site) return
    setScrapingId(domain)
    try {
      const res = await harvestOneSite(uid, watchId, site, { pageBudget: 12 })
      toast.success(`${domain} : +${res.productsIndexed} produit(s) · ${res.pctPrice}% avec prix${res.engine ? ` (via ${res.engine})` : ''}`)
      // Recalcule le benchmark (appariés, écarts) pour TOUS les sites actifs, à partir
      // du catalogue source persisté — le dashboard se met à jour sans relancer le run.
      const siteRefs = rowsToCompetitorSites(rows).map((s) => ({ siteId: s.id, domain: s.domain }))
      const rec = await recomputeReport(uid, watchId, siteRefs)
      if (rec) toast.success(`Benchmark recalculé — ${rec.matched} produit(s) apparié(s)`)
      else toast.info('Lance « Comparer catalogue » une fois pour activer le recalcul du benchmark.')
    } catch (e) {
      toast.error(`${domain} : ${e instanceof Error ? e.message : 'échec de la moisson'}`)
    } finally {
      setScrapingId(null)
    }
  }

  // Réinitialise les données collectées d'un site (destructif → confirmation).
  const resetSite = async (r: SourceSiteRow) => {
    const domain = normalizeDomain(r.domain)
    if (!uid || !domain) return
    if (!window.confirm(`Effacer toutes les données collectées de ${domain} ?\n\nLe prochain scrape repartira de zéro (utile après un passage en accès connecté pour purger les fiches sans prix).`)) return
    try {
      const n = await resetCompetitorData(uid, watchId, stableId(domain))
      toast.success(`${domain} : ${n} page(s) effacée(s). Relance ▶ pour re-scraper proprement.`)
    } catch (e) {
      toast.error(`${domain} : ${e instanceof Error ? e.message : 'échec de la réinitialisation'}`)
    }
  }

  const statsFor = (domain: string): SiteRowStats => {
    const siteId = stableId(normalizeDomain(domain))
    const meta = metaMap.get(siteId)
    const stat = report?.byCompetitor.find((c) => c.siteId === siteId)
    return {
      products: meta?.productCount,
      // Battement de MOISSON : seule preuve qu'une passe tourne sur CE site.
      harvestBeatAt: meta?.harvestBeatAt,
      // Live depuis l'index (mis à jour au scrape) prioritaire sur le rapport « Comparer ».
      pctPrice: meta?.pctPrice ?? stat?.audit.pctPrice,
      matched: stat?.matched,
      // Comparaison PRIX (ce que la veille cherche) — déjà agrégée par « Comparer ».
      cheaper: stat?.cheaper,
      avgGapPct: stat?.avgGapPct,
      medGapPct: stat?.medGapPct,
      updatedAt: meta?.updatedAt,
      lastEngine: meta?.lastEngine,
      harvestProgress: meta?.harvestProgress,
      harvestSweeps: meta?.harvestSweeps,
      lastPassPages: meta?.lastPassPages,
      lastPassProducts: meta?.lastPassProducts,
      lastPassAt: meta?.lastPassAt,
    }
  }
  // ⚠ « En cours » se lit sur le battement de MOISSON, jamais sur `updatedAt` : le node
  // « Comparer » réécrit la méta des 13 concurrents dans une seule rafale (constaté : tous
  // au même timestamp à la milliseconde), ce qui affichait « 12 en cours » au repos.
  const isLive = (s: SiteRowStats) => s.harvestBeatAt != null && now - s.harvestBeatAt < LIVE_WINDOW_MS

  const patchRow = (i: number, patch: Partial<SourceSiteRow>) =>
    onChange({
      ...config,
      sites: rows.map((r, j) => {
        if (j !== i) return r
        const merged = { ...r, ...patch } as SourceSiteRow & Record<string, unknown>
        // Une clé mise à `undefined` (moteur 'auto', auth retiré) doit être RETIRÉE,
        // pas conservée à undefined — Firestore refuse undefined à l'enregistrement.
        for (const k of Object.keys(patch)) if ((patch as Record<string, unknown>)[k] === undefined) delete merged[k]
        return merged
      }),
    })

  const addSite = () => {
    const domain = normalizeDomain(draft)
    if (!domain) return
    if (rows.some((r) => stableId(normalizeDomain(r.domain)) === stableId(domain))) { setDraft(''); return }
    onChange({ ...config, sites: [...rows, { domain, enabled: true }] })
    setDraft('')
  }

  const runImport = () => {
    onChange({ ...config, sites: importSitesIntoRows(importText, rows) })
    setImportText('')
    setImporting(false)
  }

  const active = rows.filter((r) => r.enabled).length
  // Tout sélectionner / désélectionner : bascule l'activation de TOUS les sites d'un clic.
  const allEnabled = rows.length > 0 && rows.every((r) => r.enabled)
  const toggleAll = () => onChange({ ...config, sites: rows.map((r) => ({ ...r, enabled: !allEnabled })) })
  // Statut COURANT de chaque site (état persisté) → totaux par statut TOUJOURS affichés
  // dans l'en-tête (pas seulement après un run récent), et cliquables pour filtrer.
  const statuses = rows.map((r) => {
    const s = statsFor(r.domain)
    return siteStatus({ enabled: r.enabled, live: isLive(s), ...s })
  })
  const nStatus = (k: SiteStatus) => statuses.filter((x) => x === k).length
  const liveCount = nStatus('live')
  const totalProducts = rows.reduce((n, r) => n + (statsFor(r.domain).products ?? 0), 0)

  // Ordre d'AFFICHAGE (ni le tri ni le filtre ne touchent config.sites : l'ordre
  // d'émission reste manuel). Projection {row, index d'origine, stats, statut} — l'index
  // d'origine sert à toggle/engine/remove sans décaler la config.
  let displayRows = rows.map((r, i) => {
    const stats = statsFor(r.domain)
    return { r, i, stats, status: siteStatus({ enabled: r.enabled, live: isLive(stats), ...stats }) }
  })
  // Recherche live (autocomplétion) : filtre par domaine.
  const q = search.trim().toLowerCase()
  if (q) displayRows = displayRows.filter((d) => normalizeDomain(d.r.domain).toLowerCase().includes(q))
  // Filtre par statut : clic sur un compteur de l'en-tête → n'afficher que ces sites.
  if (statusFilter) displayRows = displayRows.filter((d) => d.status === statusFilter)
  if (sort === 'status') {
    displayRows.sort((a, b) => siteStatusRank(a.status) - siteStatusRank(b.status) || a.i - b.i)
  } else if (sort === 'products') {
    displayRows.sort((a, b) => (b.stats.products ?? -1) - (a.stats.products ?? -1) || a.i - b.i)
  }
  // Badge de statut cliquable de l'en-tête : bordé, teinté, bascule le filtre sur ce statut.
  const TONE_PILL: Record<'ok' | 'warn' | 'err' | 'mute', string> = {
    ok: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
    warn: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
    err: 'text-rose-300 bg-rose-500/10 border-rose-500/30',
    mute: 'text-white/50 bg-white/[0.05] border-white/15',
  }
  const filterPill = (key: SiteStatus, count: number, tone: 'ok' | 'warn' | 'err' | 'mute', label: string) => (
    <button
      onClick={() => setStatusFilter((f) => (f === key ? null : key))}
      title={statusFilter === key ? 'Afficher tous les sites' : `N'afficher que : ${label}`}
      className={`inline-flex items-center gap-1 text-[10px] font-medium tabular-nums border rounded-md px-2 py-0.5 whitespace-nowrap transition ${TONE_PILL[tone]} ${statusFilter === key ? 'ring-1 ring-current' : 'opacity-90 hover:opacity-100'}`}
    >
      {count} {label}
    </button>
  )
  return (
    <div className="flex flex-col gap-2">
      {/* En-tête ÉPINGLÉ au scroll (le conteneur scrollant est le panneau bg-surface-2) :
          ligne 1 = titre + import ; ligne 2 = activité (en cours | bilan dernier run). */}
      <div className="sticky top-0 z-10 bg-surface-2 -mt-1 pt-1 pb-1.5 border-b border-white/5 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-white/30 whitespace-nowrap">
              {rows.length ? `${active}/${rows.length} actifs` : 'Sites'}
            </p>
            {totalProducts > 0 && (
              <p className="text-[10px] text-white/30 tabular-nums whitespace-nowrap">
                {totalProducts.toLocaleString('fr-FR')} produits
              </p>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {rows.length > 1 && (
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortMode)}
                title="Trier l'affichage (n'affecte pas l'ordre d'exécution)"
                className="bg-well border border-white/10 rounded text-[10px] text-white/50 px-1 py-0.5 focus:outline-none focus:border-indigo-500/50"
              >
                {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => (
                  <option key={m} value={m}>{SORT_LABELS[m]}</option>
                ))}
              </select>
            )}
            <button
              onClick={() => setImporting((v) => !v)}
              title="Coller une liste (un site par ligne)"
              className="flex items-center gap-1 text-[10px] whitespace-nowrap text-white/40 hover:text-indigo-400 transition-colors"
            >
              <ClipboardPaste className="w-3 h-3" /> Importer
            </button>
            {rows.length > 0 && (
              <button
                onClick={() => setPurging((v) => !v)}
                title="Vider les données de scraping (par site, par type)"
                className="flex items-center gap-1 text-[10px] whitespace-nowrap text-white/40 hover:text-rose-400 transition-colors"
              >
                <Trash2 className="w-3 h-3" /> Vider
              </button>
            )}
          </div>
        </div>
        {/* Sélection globale — pill visible, pleine ligne (pas dans l'en-tête surchargé). */}
        {rows.length > 1 && (
          <button
            onClick={toggleAll}
            title={allEnabled ? 'Désactiver tous les sites de la moisson' : 'Activer tous les sites de la moisson'}
            className="self-start inline-flex items-center gap-1.5 text-[11px] font-medium border border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 rounded-md px-2 py-1 transition-colors"
          >
            {allEnabled ? <Square className="w-3.5 h-3.5" /> : <CheckSquare className="w-3.5 h-3.5" />}
            {allEnabled ? 'Tout désélectionner' : `Tout sélectionner (${rows.length})`}
          </button>
        )}
        {/* Recherche ÉPINGLÉE (autocomplétion) — filtre la liste au fil de la frappe. */}
        {rows.length > 1 && (
          <div className="flex items-center gap-1.5 bg-well border border-white/10 rounded-lg px-2 py-1 focus-within:border-indigo-500/50">
            <Search className="w-3.5 h-3.5 text-white/30 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un site…"
              className="flex-1 min-w-0 bg-transparent text-xs text-white/80 placeholder:text-white/25 focus:outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} title="Effacer" className="shrink-0 text-white/30 hover:text-white/70">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Badges PAR STATUT — centrés, toujours affichés, cliquables pour filtrer. */}
        {rows.length > 0 && (
          <div className="flex flex-wrap justify-center items-center gap-1.5 pt-0.5">
            {liveCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" aria-hidden />
                {filterPill('live', liveCount, 'ok', 'en cours')}
              </span>
            )}
            {nStatus('ok') > 0 && filterPill('ok', nStatus('ok'), 'ok', 'OK')}
            {nStatus('empty') > 0 && filterPill('empty', nStatus('empty'), 'warn', 'sans produit')}
            {nStatus('error') > 0 && filterPill('error', nStatus('error'), 'err', 'sans catalogue')}
            {nStatus('never') > 0 && filterPill('never', nStatus('never'), 'mute', 'jamais')}
            {statusFilter && (
              <button onClick={() => setStatusFilter(null)} className="text-[10px] text-indigo-400/80 hover:text-indigo-300 px-1" title="Retirer le filtre">
                ✕ tout
              </button>
            )}
          </div>
        )}
      </div>

      {purging && uid && (
        <PurgeScrapingPanel
          uid={uid}
          watchId={watchId}
          sites={[...new Map(rows.map((r) => {
            const d = normalizeDomain(r.domain)
            return [stableId(d), { domain: d, siteId: stableId(d) }] as const
          })).values()]}
          onClose={() => setPurging(false)}
        />
      )}

      {importing && (
        <div className="flex flex-col gap-1.5">
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={'https://www.jardimax.com/\npro-motoculture.com | price, stock\n…'}
            className="w-full min-h-[80px] bg-well border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/80 font-mono focus:outline-none focus:border-indigo-500/50"
          />
          <button
            onClick={runImport}
            disabled={!importText.trim()}
            className="self-end text-xs bg-indigo-500 hover:bg-indigo-600 disabled:opacity-30 text-[#fff] px-3 py-1 rounded-lg transition-colors"
          >
            Importer
          </button>
        </div>
      )}

      {/* Tableau des sites — contenu PRINCIPAL, visible immédiatement (le champ d'ajout
          est descendu sous la liste pour ne pas la pousser hors de l'écran). */}
      {rows.length === 0 ? (
        <p className="text-[11px] text-white/30 italic">
          Aucun site. Ajoute un domaine ou importe la liste d'un node « Moisson concurrents » existant.
        </p>
      ) : displayRows.length === 0 ? (
        <p className="text-[11px] text-white/30 italic">
          Aucun site {q ? `pour « ${search.trim()} »` : 'pour ce filtre'}. <button onClick={() => { setStatusFilter(null); setSearch('') }} className="text-indigo-400 hover:text-indigo-300 not-italic">Afficher tout</button>
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {displayRows.map(({ r, i, stats }) => (
            <div key={stableId(normalizeDomain(r.domain)) + i}>
              <SourceSitesRowItem
                domain={r.domain}
                enabled={r.enabled}
                engine={r.engine ?? 'auto'}
                mode={r.mode ?? ''}
                auth={!!r.auth}
                pageBudget={r.pageBudget}
                botId={r.botId}
                stats={stats}
                live={isLive(stats)}
                now={now}
                onToggle={(enabled) => patchRow(i, { enabled })}
                onEngine={(engine) => patchRow(i, engine === 'auto' ? { engine: undefined } : { engine })}
                onMode={(mode) => patchRow(i, mode ? { mode } : { mode: undefined })}
                onBudget={(pageBudget) => patchRow(i, { pageBudget })}
                onBotId={(botId) => patchRow(i, { botId: botId.trim() || undefined })}
                onAuth={() => setCredsRow((c) => (c === i ? null : i))}
                onScrape={() => void scrapeSite(r)}
                scraping={scrapingId === normalizeDomain(r.domain)}
                onReset={() => void resetSite(r)}
                onRemove={() => { onChange({ ...config, sites: rows.filter((_, j) => j !== i) }); setCredsRow(null) }}
              />
              {credsRow === i && (
                <SiteCredentialsForm
                  host={normalizeDomain(r.domain)}
                  hasCreds={!!r.auth}
                  onSaved={() => patchRow(i, { auth: true })}
                  onCleared={() => patchRow(i, { auth: undefined })}
                  onClose={() => setCredsRow(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Ajout d'un site (sous la liste) */}
      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addSite() }}
          placeholder="Ajouter un site : exemple.com"
          className="flex-1 bg-well border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/80 focus:outline-none focus:border-indigo-500/50"
        />
        <button
          onClick={addSite}
          disabled={!normalizeDomain(draft)}
          title="Ajouter le site"
          className="shrink-0 bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white/60 px-2 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Identifiant du suivi (avancé) */}
      <label className="block mt-1">
        <span className="text-xs text-white/60 mb-1 block">Identifiant du suivi (avancé)</span>
        <input
          value={config.watchId ?? ''}
          onChange={(e) => onChange({ ...config, watchId: e.target.value })}
          placeholder="(auto : id du workflow)"
          className="w-full bg-well border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/80 font-mono focus:outline-none focus:border-indigo-500/50"
        />
        <span className="text-[11px] text-white/30 mt-1 block">
          Laisse VIDE : suivi partagé automatiquement avec les nodes branchés. Suivi courant : <code className="font-mono">{watchId}</code>
        </span>
      </label>
    </div>
  )
}
