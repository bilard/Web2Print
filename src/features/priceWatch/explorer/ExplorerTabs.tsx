// Barre d'onglets « un onglet = un concurrent ». Les compteurs viennent des MÉTA
// (un doc par site), jamais des fiches : la barre doit être lisible sans avoir chargé
// quoi que ce soit, et cliquer un onglet est le seul geste qui déclenche une lecture.
import { Loader2 } from 'lucide-react'
import type { HarvestMeta } from '../dashboard/opsMetrics'
import { useTranslation, intlLocale } from '@/lib/i18n'

export interface SiteTab {
  siteId: string
  domain: string
  productCount: number
  pctPrice: number | null
}

/** Onglets triés par volume collecté (les sites vides en dernier, mais visibles). */
export function buildTabs(meta: Map<string, HarvestMeta>): SiteTab[] {
  return [...meta.entries()]
    .map(([siteId, m]) => ({
      siteId,
      domain: (m.domain ?? siteId).replace(/^www\./, ''),
      productCount: m.productCount ?? 0,
      pctPrice: m.pctPrice ?? null,
    }))
    .sort((a, b) => b.productCount - a.productCount || a.domain.localeCompare(b.domain))
}

/** Pastille de collecte : part des fiches portant un prix — sans prix, pas de comparaison. */
function dotColor(tab: SiteTab): string {
  if (tab.productCount === 0) return 'bg-white/15'
  if (tab.pctPrice == null) return 'bg-white/30'
  if (tab.pctPrice >= 80) return 'bg-emerald-400/80'
  if (tab.pctPrice >= 40) return 'bg-amber-400/80'
  return 'bg-rose-400/80'
}

export function ExplorerTabs({ tabs, active, loading, onPick }: {
  tabs: SiteTab[]
  active: string | null
  loading: boolean
  onPick: (siteId: string) => void
}) {
  const { t, locale } = useTranslation()
  return (
    <div className="flex items-stretch gap-0.5 px-2 pt-1.5 overflow-x-auto bg-surface-2/40 border-b border-white/10 shrink-0">
      {tabs.map((tab) => {
        const on = tab.siteId === active
        return (
          <button key={tab.siteId} type="button" onClick={() => onPick(tab.siteId)}
            disabled={tab.productCount === 0}
            title={tab.productCount === 0
              ? t('pwx.aucuneFicheCollecteeSur')
              : t('pwx.tabTitle', { count: tab.productCount, pct: tab.pctPrice ?? 0 })}
            className={`group shrink-0 px-3 py-1.5 text-xs rounded-t-md border-b-2 transition-colors disabled:opacity-25 disabled:cursor-not-allowed ${
              on
                ? 'border-indigo-400 bg-well text-white'
                : 'border-transparent text-white/45 hover:text-white/85 hover:bg-white/[0.04]'
            }`}>
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor(tab)}`} />
              {tab.domain}
              <span className={`text-[10px] tabular-nums ${on ? 'text-indigo-300/90' : 'text-white/25 group-hover:text-white/40'}`}>
                {tab.productCount.toLocaleString(intlLocale(locale))}
              </span>
              {on && loading && <Loader2 className="w-3 h-3 animate-spin text-indigo-300" />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
