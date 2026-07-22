// src/features/workflows/registry/sourceSitesConfig.tsx
// Panneau de config du node « Sites sources » : tableau de gestion des sites
// concurrents avec stats persistées LIVE (useCompetitorMeta + useCatalogReport,
// onSnapshot — indépendant de tout run). Clé de lecture = watchId dérivé comme au
// runtime (config sinon id du workflow courant).
import { useEffect, useMemo, useState } from 'react'
import { Plus, ClipboardPaste } from 'lucide-react'
import { useWorkflowStore } from '../persistence/workflow.store'
import { useCompetitorMeta, useCatalogReport } from '@/features/priceWatch/useCatalogReport'
import { stableId } from '@/features/priceWatch/core'
import {
  normalizeDomain, deriveWatchId, importSitesIntoRows, siteStatus, siteStatusRank,
  type SourceSiteRow, type SiteStatus,
} from '@/features/priceWatch/sourceSites'
import { SourceSitesRowItem, type SiteRowStats } from './sourceSitesRow'
import { SiteCredentialsForm } from './sourceSitesCreds'
import type { SourceSitesNodeConfig } from './sourceSitesNode'

/** Heartbeat de moisson plus récent que cette fenêtre = « scraping en cours »
 *  (la moisson écrit la méta toutes les ~15 pages pendant la passe). */
const LIVE_WINDOW_MS = 2 * 60_000

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
  const [statusFilter, setStatusFilter] = useState<SiteStatus | null>(null)
  const [credsRow, setCredsRow] = useState<number | null>(null)

  const statsFor = (domain: string): SiteRowStats => {
    const siteId = stableId(normalizeDomain(domain))
    const meta = metaMap.get(siteId)
    const stat = report?.byCompetitor.find((c) => c.siteId === siteId)
    return {
      products: meta?.productCount,
      pctPrice: stat?.audit.pctPrice,
      matched: stat?.matched,
      updatedAt: meta?.updatedAt,
      lastEngine: meta?.lastEngine,
      harvestProgress: meta?.harvestProgress,
      harvestSweeps: meta?.harvestSweeps,
      lastPassPages: meta?.lastPassPages,
      lastPassProducts: meta?.lastPassProducts,
      lastPassAt: meta?.lastPassAt,
    }
  }
  const isLive = (s: SiteRowStats) => s.updatedAt != null && now - s.updatedAt < LIVE_WINDOW_MS

  const patchRow = (i: number, patch: Partial<SourceSiteRow>) =>
    onChange({ ...config, sites: rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) })

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
          </div>
        </div>
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
            {nStatus('error') > 0 && filterPill('error', nStatus('error'), 'err', 'bloqués')}
            {nStatus('never') > 0 && filterPill('never', nStatus('never'), 'mute', 'jamais')}
            {statusFilter && (
              <button onClick={() => setStatusFilter(null)} className="text-[10px] text-indigo-400/80 hover:text-indigo-300 px-1" title="Retirer le filtre">
                ✕ tout
              </button>
            )}
          </div>
        )}
      </div>

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
          Aucun site pour ce filtre. <button onClick={() => setStatusFilter(null)} className="text-indigo-400 hover:text-indigo-300 not-italic">Afficher tout</button>
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {displayRows.map(({ r, i, stats }) => (
            <div key={stableId(normalizeDomain(r.domain)) + i}>
              <SourceSitesRowItem
                domain={r.domain}
                enabled={r.enabled}
                engine={r.engine ?? 'auto'}
                auth={!!r.auth}
                stats={stats}
                live={isLive(stats)}
                now={now}
                onToggle={(enabled) => patchRow(i, { enabled })}
                onEngine={(engine) => patchRow(i, engine === 'auto' ? { engine: undefined } : { engine })}
                onAuth={() => setCredsRow((c) => (c === i ? null : i))}
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
