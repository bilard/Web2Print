// Colonne des concurrents, avec leurs métriques. Remplace la barre d'onglets : sur 19
// sites, des onglets horizontaux ne portaient qu'un nom et un compteur, et défilaient.
//
// Aucune de ces mesures ne demande de charger un site : le volume et la complétude
// viennent des MÉTA (un doc par concurrent), l'appariement et l'écart médian du rapport
// déjà agrégé. Cliquer reste le seul geste qui déclenche une lecture de fiches.
import { Loader2 } from 'lucide-react'
import type { HarvestMeta } from '../dashboard/opsMetrics'
import type { CompetitorStat } from '../catalog/report'
import { pct } from '../dashboard/format'
import { useTranslation, intlLocale } from '@/lib/i18n'

export interface SiteRailItem {
  siteId: string
  domain: string
  /** Fiches indexées (méta de moisson). */
  collected: number
  /** Part des fiches portant un prix — sans prix, pas de comparaison possible. */
  pctPrice: number | null
  /** Vos produits retrouvés chez lui (rapport agrégé, hors plafond d'affichage). */
  matched: number
  /** Produits où il est moins cher que vous. */
  cheaper: number
  ruptures: number
  /** Écart médian de SES prix face aux vôtres. Négatif = il est moins cher. */
  medGapPct: number | null
}

/**
 * Fusionne les méta de moisson et les stats du rapport. Les deux sources sont
 * indépendantes : un site peut être moissonné sans rapport (jamais comparé), ou figurer
 * dans un vieux rapport sans méta. On affiche ce qu'on a, jamais un zéro inventé.
 */
export function buildRail(meta: Map<string, HarvestMeta>, stats: CompetitorStat[]): SiteRailItem[] {
  const byId = new Map(stats.map((s) => [s.siteId, s]))
  const ids = new Set([...meta.keys(), ...stats.map((s) => s.siteId)])
  return [...ids]
    // Un site DÉCOCHÉ dans « Sites sources » n'a plus à figurer : ses fiches d'hier ne
    // sont plus rafraîchies. `enabled` absent = état inconnu (aucun run depuis
    // l'introduction du champ) → on le garde, mieux vaut un site de trop qu'une liste vide.
    .filter((siteId) => meta.get(siteId)?.enabled !== false)
    .map((siteId) => {
      const m = meta.get(siteId)
      const s = byId.get(siteId)
      return {
        siteId,
        domain: (m?.domain ?? s?.domain ?? siteId).replace(/^www\./, ''),
        collected: m?.productCount ?? s?.audit?.indexed ?? 0,
        pctPrice: m?.pctPrice ?? null,
        matched: s?.matched ?? 0,
        cheaper: s?.cheaper ?? 0,
        ruptures: s?.ruptures ?? 0,
        medGapPct: s?.medGapPct ?? s?.avgGapPct ?? null,
      }
    })
    // Alphabétique : sur 24 sites, on cherche un concurrent qu'on a en tête, pas le
    // plus gros. Le volume reste lisible sur chaque ligne.
    .sort((a, b) => a.domain.localeCompare(b.domain, 'fr'))
}

function dotColor(item: SiteRailItem): string {
  if (item.collected === 0) return 'bg-white/15'
  if (item.pctPrice == null) return 'bg-white/30'
  if (item.pctPrice >= 80) return 'bg-emerald-400/80'
  if (item.pctPrice >= 40) return 'bg-amber-400/80'
  return 'bg-rose-400/80'
}

export function ExplorerSiteRail({ items, active, loading, onPick }: {
  items: SiteRailItem[]
  active: string | null
  loading: boolean
  onPick: (siteId: string) => void
}) {
  const { t, locale } = useTranslation()
  const n = (v: number) => v.toLocaleString(intlLocale(locale))

  return (
    <ul className="h-full overflow-auto py-1">
      {items.map((item) => {
        const on = item.siteId === active
        const dead = item.collected === 0
        return (
          <li key={item.siteId}>
            <button type="button" onClick={() => onPick(item.siteId)} disabled={dead}
              title={dead ? t('pwx.aucuneFicheCollecteeSur') : t('pwx.tabTitle', { count: item.collected, pct: item.pctPrice ?? 0 })}
              className={`w-full text-left px-2 py-1.5 flex gap-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                on ? 'bg-well' : 'hover:bg-white/[0.04]'
              }`}>
              <span className={`w-[2px] self-stretch rounded shrink-0 ${on ? 'bg-indigo-400' : 'bg-transparent'}`} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor(item)}`} />
                  <span className={`truncate text-[12px] ${on ? 'text-white font-medium' : 'text-white/65'}`}>
                    {item.domain}
                  </span>
                  {on && loading && <Loader2 className="w-3 h-3 animate-spin text-indigo-300 shrink-0" />}
                  {item.medGapPct != null && (
                    <span className={`ml-auto text-[10px] tabular-nums shrink-0 ${
                      item.medGapPct < 0 ? 'text-rose-300' : 'text-emerald-300'
                    }`}>
                      {pct(item.medGapPct)}
                    </span>
                  )}
                </span>
                {/* Deux lignes de mesures : volume collecté d'abord (ce qu'on peut lire),
                    pression tarifaire ensuite (ce qui coûte de l'argent). */}
                <span className="flex items-center gap-2 mt-0.5 text-[10px] tabular-nums text-white/30 pl-3">
                  <span title={t('pwx.rail.collected')}>{n(item.collected)}</span>
                  {item.pctPrice != null && <span title={t('pw.audit.price')}>{item.pctPrice} %</span>}
                  {item.matched > 0 && (
                    <span className="text-sky-300/70" title={t('pwx.stats.matched.help')}>{n(item.matched)}</span>
                  )}
                  {item.cheaper > 0 && (
                    <span className="text-rose-300/70" title={t('pwx.stats.cheaper.help')}>↓{n(item.cheaper)}</span>
                  )}
                  {item.ruptures > 0 && (
                    <span title={t('pwx.stats.ruptures.help')}>⊘{n(item.ruptures)}</span>
                  )}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
