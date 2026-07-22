// src/features/workflows/registry/sourceSitesRow.tsx
// Ligne dense (2 niveaux) du tableau « Sites sources » :
//   niveau 1 — activation · domaine (pleine largeur) · état live · corbeille ;
//   niveau 2 — moteur forcé + chips de stats (insécables, retour à la ligne propre).
// L'état « scraping en cours » (heartbeat Firestore < 2 min) est surligné en vert pulsé ;
// un catalogue entièrement balayé affiche « balayé ×N ».
import { Trash2 } from 'lucide-react'
import { agoShort } from '@/features/priceWatch/dashboard/format'

export interface SiteRowStats {
  products?: number
  pctPrice?: number
  matched?: number
  updatedAt?: number
  /** Moteur ayant réellement fourni le HTML à la dernière passe (télémétrie). */
  lastEngine?: string
  /** Progression du balayage 0..1 (1 = catalogue entièrement parcouru). */
  harvestProgress?: number
  /** Nombre de balayages complets déjà effectués. */
  harvestSweeps?: number
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
  const color = tone === 'ok' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : 'text-white/40'
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-white/25">{label}</span>
      <span className={`tabular-nums ${color}`}>{value}</span>
    </span>
  )
}

export function SourceSitesRowItem({ domain, enabled, engine, stats, live, now, onToggle, onEngine, onRemove }: {
  domain: string
  enabled: boolean
  engine: string
  stats: SiteRowStats
  /** true = heartbeat de moisson récent → scraping en cours (surligné + pulsé). */
  live: boolean
  /** Horloge partagée du parent (tick 30 s) — évite un Date.now() par ligne. */
  now: number
  onToggle: (enabled: boolean) => void
  onEngine: (engine: string) => void
  onRemove: () => void
}) {
  const scraped = stats.updatedAt != null
  const swept = (stats.harvestProgress ?? 0) >= 1
  return (
    <div
      className={`rounded-lg px-2 py-1.5 transition-colors ${
        live ? 'bg-emerald-500/[0.07] ring-1 ring-emerald-400/40' : 'bg-white/[0.03]'
      } ${enabled ? '' : 'opacity-45'}`}
    >
      {/* Niveau 1 : activer · domaine · état · suppr */}
      <div className="flex items-center gap-2 min-w-0">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="shrink-0 accent-indigo-500"
          title={enabled ? 'Désactiver ce site' : 'Activer ce site'}
        />
        <span className="text-xs text-white/80 truncate flex-1 min-w-0" title={domain}>
          {domain.replace(/^www\./, '')}
        </span>
        {live ? (
          <span className="shrink-0 flex items-center gap-1.5 text-[10px] text-emerald-300 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
            scraping…
          </span>
        ) : swept ? (
          <span
            className="shrink-0 text-[10px] text-emerald-300/80 whitespace-nowrap"
            title={`Catalogue entièrement balayé ${stats.harvestSweeps ? `×${stats.harvestSweeps}` : ''}`}
          >
            balayé{stats.harvestSweeps ? ` ×${stats.harvestSweeps}` : ''} ✓
          </span>
        ) : null}
        <button
          onClick={onRemove}
          title="Retirer ce site"
          className="shrink-0 text-white/20 hover:text-red-400 transition-colors p-0.5"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      {/* Niveau 2 : moteur + chips de stats (wrap propre, jamais de coupure interne) */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pl-6 mt-1 text-[10px]">
        <select
          value={engine}
          onChange={(e) => onEngine(e.target.value)}
          title="Moteur de scraping (Auto = cascade standard)"
          className="shrink-0 bg-well border border-white/10 rounded text-[10px] text-white/60 px-1 py-0.5 focus:outline-none focus:border-indigo-500/50"
        >
          {ENGINE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {scraped ? (
          <>
            {chip('produits', (stats.products ?? 0).toLocaleString('fr-FR'), (stats.products ?? 0) > 0 ? 'ok' : 'mute')}
            {stats.pctPrice != null && chip('prix', `${stats.pctPrice}%`, stats.pctPrice >= 80 ? 'ok' : 'warn')}
            {stats.matched != null && chip('appariés', stats.matched.toLocaleString('fr-FR'), stats.matched > 0 ? 'ok' : 'mute')}
            {!swept && stats.harvestProgress != null && chip('balayage', `${Math.round(stats.harvestProgress * 100)}%`, 'mute')}
            {chip('scrape', agoShort(stats.updatedAt, now), 'mute')}
            {stats.lastEngine && chip('via', ENGINE_LABELS[stats.lastEngine] ?? stats.lastEngine, 'mute')}
          </>
        ) : (
          <span className="text-white/20 italic whitespace-nowrap">jamais scrapé</span>
        )}
      </div>
    </div>
  )
}
