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
  type SourceSiteRow,
} from '@/features/priceWatch/sourceSites'
import { SourceSitesRowItem, type SiteRowStats } from './sourceSitesRow'
import { SiteCredentialsForm } from './sourceSitesCreds'
import type { SourceSitesNodeConfig } from './sourceSitesNode'

/** Heartbeat de moisson plus récent que cette fenêtre = « scraping en cours »
 *  (la moisson écrit la méta toutes les ~15 pages pendant la passe). */
const LIVE_WINDOW_MS = 2 * 60_000

type SortMode = 'manual' | 'status' | 'products'
const SORT_LABELS: Record<SortMode, string> = {
  manual: 'Ordre manuel', status: 'Par statut', products: 'Par produits',
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
  const liveCount = rows.filter((r) => isLive(statsFor(r.domain))).length
  // Bilan agrégé de la dernière session de moisson (passes < 30 min) : réponse
  // immédiate à « il vient de finir — qu'est-ce qui a marché ? ».
  const recent = rows
    .map((r) => statsFor(r.domain))
    .filter((s) => s.lastPassAt != null && now - (s.lastPassAt as number) < 30 * 60_000)
  const runOk = recent.filter((s) => (s.lastPassPages ?? 0) > 0 && (s.lastPassProducts ?? 0) > 0).length
  const runWarn = recent.filter((s) => (s.lastPassPages ?? 0) > 0 && (s.lastPassProducts ?? 0) === 0).length
  const runErr = recent.filter((s) => (s.lastPassPages ?? 0) === 0).length
  const runProducts = recent.reduce((n, s) => n + (s.lastPassProducts ?? 0), 0)

  // Ordre d'AFFICHAGE (le tri ne touche jamais config.sites : l'ordre d'émission reste
  // l'ordre manuel). On trie une projection {row, index d'origine, stats} — l'index
  // d'origine est réutilisé pour toggle/engine/remove afin de ne pas décaler la config.
  const displayRows = rows.map((r, i) => ({ r, i, stats: statsFor(r.domain) }))
  if (sort === 'status') {
    displayRows.sort((a, b) => {
      const ra = siteStatusRank(siteStatus({ enabled: a.r.enabled, live: isLive(a.stats), ...a.stats }))
      const rb = siteStatusRank(siteStatus({ enabled: b.r.enabled, live: isLive(b.stats), ...b.stats }))
      return ra - rb || a.i - b.i // rang égal → ordre manuel stable
    })
  } else if (sort === 'products') {
    displayRows.sort((a, b) => (b.stats.products ?? -1) - (a.stats.products ?? -1) || a.i - b.i)
  }
  return (
    <div className="flex flex-col gap-2">
      {/* En-tête ÉPINGLÉ au scroll (le conteneur scrollant est le panneau bg-surface-2) :
          ligne 1 = titre + import ; ligne 2 = activité (en cours | bilan dernier run). */}
      <div className="sticky top-0 z-10 bg-surface-2 -mt-1 pt-1 pb-1.5 border-b border-white/5 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] uppercase tracking-wider text-white/30 whitespace-nowrap truncate">
            Sites concurrents {rows.length ? `· ${active}/${rows.length} actifs` : ''}
          </p>
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
        {liveCount > 0 ? (
          <p className="text-[10px] flex items-center gap-1.5 text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" aria-hidden />
            Moisson en cours · {liveCount} site{liveCount > 1 ? 's' : ''}
          </p>
        ) : recent.length > 0 ? (
          <p className="text-[10px] tabular-nums flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-white/40">Dernier run :</span>
            {runProducts > 0 && <span className="text-emerald-300">+{runProducts.toLocaleString('fr-FR')} produits</span>}
            <span className="text-emerald-300">{runOk} OK</span>
            {runWarn > 0 && <span className="text-amber-300">{runWarn} sans produit</span>}
            {runErr > 0 && <span className="text-rose-300">{runErr} bloqués</span>}
          </p>
        ) : null}
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

      {/* Ajout d'un site */}
      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addSite() }}
          placeholder="exemple.com"
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

      {/* Tableau des sites */}
      {rows.length === 0 ? (
        <p className="text-[11px] text-white/30 italic">
          Aucun site. Ajoute un domaine ou importe la liste d'un node « Moisson concurrents » existant.
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
