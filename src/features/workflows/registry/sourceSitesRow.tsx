// src/features/workflows/registry/sourceSitesRow.tsx
// Ligne dense (2 niveaux) du tableau « Sites sources » :
//   niveau 1 — activation · domaine · ACTIVITÉ (scraping… animé | verdict ✓/⚠/✗ de la
//   dernière passe) · corbeille ; niveau 2 — moteur forcé + chips de stats insécables.
// Pendant la moisson : ring vert pulsé + barre de balayage animée (progress-indeterminate).
// Après la passe : badge verdict lisible d'un coup d'œil, pop fx-result s'il vient de tomber.
import { Trash2, Lock, LockOpen } from 'lucide-react'
import { agoShort } from '@/features/priceWatch/dashboard/format'

export interface SiteRowStats {
  products?: number
  pctPrice?: number
  matched?: number
  updatedAt?: number
  lastEngine?: string
  harvestProgress?: number
  harvestSweeps?: number
  /** Résultat de la dernière passe de moisson (verdict). */
  lastPassPages?: number
  lastPassProducts?: number
  lastPassAt?: number
}

/** Libellés du moteur réellement utilisé. 'cloudFunction' = fetch serveur (Cloud
 *  Function fetchPageHtml, palier 1 gratuit de la cascade Auto). */
const ENGINE_LABELS: Record<string, string> = {
  cloudFunction: 'Serveur', jina: 'Jina', proxy: 'Proxy', firecrawl: 'Firecrawl',
  brightdata: 'BD', authenticated: 'Connecté',
}
const ENGINE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'jina', label: 'Jina' },
  { value: 'firecrawl', label: 'Firecrawl' },
  { value: 'brightdata', label: 'Bright Data' },
]

/** Verdict de la dernière passe : vert = produits indexés, ambre = pages lues mais rien
 *  extrait, rouge = aucune page (site bloqué/inaccessible). null = jamais moissonné. */
function passVerdict(s: SiteRowStats): { cls: string; text: string; title: string } | null {
  if (s.lastPassAt == null) return null
  const pages = s.lastPassPages ?? 0
  const products = s.lastPassProducts ?? 0
  if (pages === 0) return {
    cls: 'text-rose-300 bg-rose-500/10 border-rose-500/25',
    text: '✗ 0 page',
    title: 'Dernière passe : aucune page lue — site bloqué ou inaccessible (essaie un autre moteur)',
  }
  if (products === 0) return {
    cls: 'text-amber-300 bg-amber-500/10 border-amber-500/25',
    text: `⚠ 0 produit · ${pages} p`,
    title: `Dernière passe : ${pages} page(s) lue(s) mais aucun produit extrait — gabarit de liste non reconnu ?`,
  }
  return {
    cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25',
    text: `✓ +${products.toLocaleString('fr-FR')} · ${pages} p`,
    title: `Dernière passe : ${products} produit(s) indexé(s) sur ${pages} page(s)`,
  }
}

function chip(label: string, value: string, tone: 'ok' | 'warn' | 'mute'): JSX.Element {
  const color = tone === 'ok' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : 'text-white/40'
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-white/25">{label}</span>
      <span className={`tabular-nums ${color}`}>{value}</span>
    </span>
  )
}

export function SourceSitesRowItem({ domain, enabled, engine, auth, stats, live, now, onToggle, onEngine, onAuth, onRemove }: {
  domain: string
  enabled: boolean
  engine: string
  /** Site à prix connectés (identifiants configurés). */
  auth: boolean
  stats: SiteRowStats
  /** true = heartbeat de moisson récent → scraping en cours (ring pulsé + barre animée). */
  live: boolean
  /** Horloge partagée du parent (tick 30 s). */
  now: number
  onToggle: (enabled: boolean) => void
  onEngine: (engine: string) => void
  /** Ouvre le mini-formulaire d'identifiants (accès connecté). */
  onAuth: () => void
  onRemove: () => void
}) {
  const scraped = stats.updatedAt != null
  const swept = (stats.harvestProgress ?? 0) >= 1
  const verdict = passVerdict(stats)
  // Le verdict vient de tomber (< 2 min) → pop d'apparition pour attirer l'œil.
  const fresh = stats.lastPassAt != null && now - stats.lastPassAt < 2 * 60_000
  return (
    <div
      className={`relative rounded-lg px-2 py-1.5 transition-colors ${
        live ? 'bg-emerald-500/[0.07] ring-1 ring-emerald-400/40' : 'bg-white/[0.03]'
      } ${enabled ? '' : 'opacity-45'}`}
    >
      {/* Niveau 1 : activer · domaine · activité · suppr */}
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
          <span className="shrink-0 flex items-center gap-1.5 text-[10px] font-medium text-emerald-300 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
            scraping…
          </span>
        ) : verdict ? (
          <span
            title={verdict.title}
            className={`shrink-0 whitespace-nowrap text-[10px] font-medium tabular-nums border rounded-md px-1.5 py-0.5 ${verdict.cls} ${fresh ? 'fx-result' : ''}`}
          >
            {verdict.text}
          </span>
        ) : null}
        <button
          onClick={onAuth}
          title={auth ? 'Accès connecté configuré — modifier les identifiants' : 'Configurer un accès connecté (prix visibles uniquement authentifié)'}
          className={`shrink-0 transition-colors p-0.5 ${auth ? 'text-emerald-400 hover:text-emerald-300' : 'text-white/20 hover:text-indigo-400'}`}
        >
          {auth ? <Lock className="w-3 h-3" /> : <LockOpen className="w-3 h-3" />}
        </button>
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
            {swept
              ? chip('balayé', `×${stats.harvestSweeps ?? 1} ✓`, 'ok')
              : stats.harvestProgress != null && chip('balayage', `${Math.round(stats.harvestProgress * 100)}%`, 'mute')}
            {chip('scrape', agoShort(stats.updatedAt, now), 'mute')}
            {stats.lastEngine && chip('via', ENGINE_LABELS[stats.lastEngine] ?? stats.lastEngine, 'mute')}
          </>
        ) : (
          <span className="text-white/20 italic whitespace-nowrap">jamais scrapé</span>
        )}
      </div>
      {/* Barre de balayage animée pendant la moisson (très visible, style TopProgressBar) */}
      {live && (
        <div className="absolute bottom-0 left-1 right-1 h-[3px] overflow-hidden rounded-full" aria-hidden>
          <div className="progress-indeterminate absolute top-0 h-full w-1/3 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
        </div>
      )}
    </div>
  )
}
