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

export function ExplorerTabs({ tabs, active, loading, onPick }: {
  tabs: SiteTab[]
  active: string | null
  loading: boolean
  onPick: (siteId: string) => void
}) {
  const { t, locale } = useTranslation()
  return (
    <div className="flex items-stretch gap-1 overflow-x-auto border-b border-white/10 pb-px">
      {tabs.map((tab) => {
        const on = tab.siteId === active
        return (
          <button key={tab.siteId} type="button" onClick={() => onPick(tab.siteId)}
            disabled={tab.productCount === 0}
            title={tab.productCount === 0 ? t('pwx.aucuneFicheCollecteeSur') : t('pwx.tabCollected', { count: tab.productCount })}
            className={`shrink-0 px-3 py-2 text-xs rounded-t border-b-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
              on
                ? 'border-indigo-400 bg-surface-2 text-white'
                : 'border-transparent text-white/50 hover:text-white/80 hover:bg-white/[0.03]'
            }`}>
            <span className="flex items-center gap-1.5">
              {tab.domain}
              <span className={`text-[10px] tabular-nums ${on ? 'text-white/50' : 'text-white/30'}`}>
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
