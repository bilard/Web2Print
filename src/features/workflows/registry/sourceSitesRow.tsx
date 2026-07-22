// src/features/workflows/registry/sourceSitesRow.tsx
// Ligne dense (2 niveaux) du tableau « Sites sources » : activation · domaine · moteur
// forcé · suppression, puis chips de stats persistées (produits, % prix, appariés,
// dernier scrape). Panneau étroit oblige — pas de vraie table large.
import { Trash2 } from 'lucide-react'
import { ago } from '@/features/priceWatch/dashboard/format'

export interface SiteRowStats {
  products?: number
  pctPrice?: number
  matched?: number
  updatedAt?: number
  /** Moteur ayant réellement fourni le HTML à la dernière passe (télémétrie). */
  lastEngine?: string
}

/** Libellés courts du moteur réellement utilisé (CompetitorMeta.lastEngine). */
const ENGINE_LABELS: Record<string, string> = {
  cloudFunction: 'CF', jina: 'Jina', proxy: 'Proxy', brightdata: 'BD',
}

const ENGINE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'jina', label: 'Jina' },
  { value: 'brightdata', label: 'Bright Data' },
]

function chip(label: string, value: string, tone: 'ok' | 'warn' | 'mute'): JSX.Element {
  const color = tone === 'ok' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : 'text-white/30'
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-white/25">{label}</span>
      <span className={`tabular-nums ${color}`}>{value}</span>
    </span>
  )
}

export function SourceSitesRowItem({ domain, enabled, engine, stats, onToggle, onEngine, onRemove }: {
  domain: string
  enabled: boolean
  engine: string
  stats: SiteRowStats
  onToggle: (enabled: boolean) => void
  onEngine: (engine: string) => void
  onRemove: () => void
}) {
  const scraped = stats.updatedAt != null
  return (
    <div className={`rounded-lg px-2 py-1.5 bg-white/[0.03] ${enabled ? '' : 'opacity-45'}`}>
      {/* Niveau 1 : activer · domaine · moteur · suppr */}
      <div className="flex items-center gap-2 min-w-0">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="shrink-0 accent-indigo-500"
          title={enabled ? 'Désactiver ce site' : 'Activer ce site'}
        />
        <span className="text-xs text-white/80 truncate flex-1" title={domain}>
          {domain.replace(/^www\./, '')}
        </span>
        <select
          value={engine}
          onChange={(e) => onEngine(e.target.value)}
          title="Moteur de scraping (Auto = cascade standard)"
          className="shrink-0 bg-well border border-white/10 rounded text-[10px] text-white/60 px-1 py-0.5 focus:outline-none focus:border-indigo-500/50"
        >
          {ENGINE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button
          onClick={onRemove}
          title="Retirer ce site"
          className="shrink-0 text-white/20 hover:text-red-400 transition-colors p-0.5"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      {/* Niveau 2 : chips de stats persistées */}
      <div className="flex items-center gap-3 pl-6 mt-0.5 text-[10px]">
        {scraped ? (
          <>
            {chip('produits', (stats.products ?? 0).toLocaleString('fr-FR'), (stats.products ?? 0) > 0 ? 'ok' : 'mute')}
            {stats.pctPrice != null && chip('prix', `${stats.pctPrice}%`, stats.pctPrice >= 80 ? 'ok' : 'warn')}
            {stats.matched != null && chip('appariés', stats.matched.toLocaleString('fr-FR'), stats.matched > 0 ? 'ok' : 'mute')}
            {chip('scrape', ago(stats.updatedAt as number), 'mute')}
            {stats.lastEngine && chip('via', ENGINE_LABELS[stats.lastEngine] ?? stats.lastEngine, 'mute')}
          </>
        ) : (
          <span className="text-white/20 italic">jamais scrapé</span>
        )}
      </div>
    </div>
  )
}
