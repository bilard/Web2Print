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
  /** Coché dans le node « Sites sources ». `false` = en pause : plus moissonné, plus
   *  interrogé, et retiré du comparatif au prochain « Comparer catalogue ». */
  enabled: boolean
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
    // ⚠ Les sites DÉCOCHÉS étaient masqués — ils disparaissaient du rail sans un mot,
    // ce qui se lit comme une perte de données alors que leurs fiches sont intactes.
    // Ils restent donc visibles, marqués « en pause » et rangés en fin de liste : c'est
    // le seul endroit où l'on voit d'un coup d'œil qui participe encore au comparatif.
    // `enabled` absent = état inconnu (aucun run depuis l'introduction du champ) → actif.
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
        enabled: m?.enabled !== false,
      }
    })
    // Les sites en pause en bas — ils ne participent plus à rien — puis alphabétique :
    // sur 24 concurrents, on cherche celui qu'on a en tête, pas le plus gros. Le volume
    // reste lisible sur chaque ligne.
    .sort((a, b) => Number(!a.enabled) - Number(!b.enabled)
      || a.domain.localeCompare(b.domain, 'fr'))
}

function dotColor(item: SiteRailItem): string {
  if (item.collected === 0) return 'bg-white/15'
  if (item.pctPrice == null) return 'bg-white/30'
  if (item.pctPrice >= 80) return 'bg-emerald-400/80'
  if (item.pctPrice >= 40) return 'bg-amber-400/80'
  return 'bg-rose-400/80'
}

export function ExplorerSiteRail({ items, active, loading, onPick, searchHits }: {
  items: SiteRailItem[]
  active: string | null
  loading: boolean
  onPick: (siteId: string) => void
  /**
   * Fiches trouvées par la recherche transversale, par site.
   *
   * ⚠ Le rail est la seule vue d'ensemble des vingt-quatre concurrents. Sans ce report,
   * la recherche ne s'affichait qu'en liste à droite : on lisait « trouvé chez 13 » sans
   * jamais voir LESQUELS parmi ceux de gauche, ni pouvoir y aller d'un clic.
   */
  searchHits?: Map<string, number>
}) {
  const { t, locale } = useTranslation()
  const n = (v: number) => v.toLocaleString(intlLocale(locale))

  return (
    <ul className="h-full overflow-auto py-1">
      {items.map((item) => {
        const on = item.siteId === active
        const dead = item.collected === 0
        const hit = searchHits?.get(item.siteId)
        // Une recherche en cours partage le rail en deux : ce qui répond, et le reste.
        // Estomper les autres fait ressortir les treize sans les masquer — un site sans
        // résultat reste une information, et reste cliquable.
        const dimmed = searchHits != null && searchHits.size > 0 && !hit
        // Un site en pause reste CONSULTABLE : ses fiches d'hier sont toujours là, et
        // c'est souvent pour les revoir qu'on le cherche.
        const paused = !item.enabled
        return (
          <li key={item.siteId}>
            <button type="button" onClick={() => onPick(item.siteId)} disabled={dead}
              title={dead ? t('pwx.aucuneFicheCollecteeSur') : t('pwx.tabTitle', { count: item.collected, pct: item.pctPrice ?? 0 })}
              className={`w-full text-left px-2 py-1.5 flex gap-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                on ? 'bg-well' : hit ? 'bg-amber-500/[0.07] hover:bg-amber-500/[0.12]' : 'hover:bg-white/[0.04]'
              } ${dimmed ? 'opacity-35' : ''}`}>
              <span className={`w-[2px] self-stretch rounded shrink-0 ${
                on ? 'bg-indigo-400' : hit ? 'bg-amber-400/70' : 'bg-transparent'
              }`} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor(item)}`} />
                  <span className={`truncate text-[12px] ${on ? 'text-white font-medium' : paused ? 'text-white/35' : 'text-white/65'}`}>
                    {item.domain}
                  </span>
                  {paused && (
                    <span className="shrink-0 rounded px-1 py-px text-[9px] font-medium uppercase tracking-wide text-amber-300/80 bg-amber-500/10 border border-amber-500/25"
                      title={t('pwx.rail.pausedHelp')}>
                      {t('pwx.rail.paused')}
                    </span>
                  )}
                  {hit != null && (
                    <span className="shrink-0 rounded px-1 py-px text-[9px] font-medium tabular-nums text-amber-200 bg-amber-500/15 border border-amber-500/30"
                      title={t('pwx.rail.searchHitHelp')}>
                      {n(hit)}
                    </span>
                  )}
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
