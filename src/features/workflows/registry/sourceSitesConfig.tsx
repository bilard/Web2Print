// src/features/workflows/registry/sourceSitesConfig.tsx
// Panneau de config du node « Sites sources » : tableau de gestion des sites
// concurrents avec stats persistées LIVE (useCompetitorMeta + useCatalogReport,
// onSnapshot — indépendant de tout run). Clé de lecture = watchId dérivé comme au
// runtime (config sinon id du workflow courant).
import { useMemo, useState } from 'react'
import { Plus, ClipboardPaste } from 'lucide-react'
import { useWorkflowStore } from '../persistence/workflow.store'
import { useCompetitorMeta, useCatalogReport } from '@/features/priceWatch/useCatalogReport'
import { stableId } from '@/features/priceWatch/core'
import {
  normalizeDomain, deriveWatchId, importSitesIntoRows, type SourceSiteRow,
} from '@/features/priceWatch/sourceSites'
import { SourceSitesRowItem, type SiteRowStats } from './sourceSitesRow'
import type { SourceSitesNodeConfig } from './sourceSitesNode'

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

  const [draft, setDraft] = useState('')
  const [importing, setImporting] = useState(false)
  const [importText, setImportText] = useState('')

  const statsFor = (domain: string): SiteRowStats => {
    const siteId = stableId(normalizeDomain(domain))
    const meta = metaMap.get(siteId)
    const stat = report?.byCompetitor.find((c) => c.siteId === siteId)
    return {
      products: meta?.productCount,
      pctPrice: stat?.audit.pctPrice,
      matched: stat?.matched,
      updatedAt: meta?.updatedAt,
    }
  }

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
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-white/30">
          Sites concurrents {rows.length ? `· ${active}/${rows.length} actifs` : ''}
        </p>
        <button
          onClick={() => setImporting((v) => !v)}
          title="Coller une liste (un site par ligne)"
          className="flex items-center gap-1 text-[10px] text-white/40 hover:text-indigo-400 transition-colors"
        >
          <ClipboardPaste className="w-3 h-3" /> Importer une liste
        </button>
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
          {rows.map((r, i) => (
            <SourceSitesRowItem
              key={stableId(normalizeDomain(r.domain)) + i}
              domain={r.domain}
              enabled={r.enabled}
              engine={r.engine ?? 'auto'}
              stats={statsFor(r.domain)}
              onToggle={(enabled) => patchRow(i, { enabled })}
              onEngine={(engine) => patchRow(i, engine === 'auto' ? { engine: undefined } : { engine })}
              onRemove={() => onChange({ ...config, sites: rows.filter((_, j) => j !== i) })}
            />
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
