import { useEffect, useMemo } from 'react'
import { Activity, RefreshCw } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useUsageStats } from '@/features/stats/useUsageStats'
import { fetchProviderBalances } from '@/features/stats/providerBalances'
import { useBrightDataAccount } from '@/features/stats/useBrightDataAccount'
import { useAiSettingsStore } from '@/stores/aiSettings.store'
import type { UsageStatsLike } from '@/features/finance/types'
import { buildRadarCostRows } from './radarCostRows'
import { RadarCostCard } from './RadarCostCard'
import { t } from '@/lib/i18n'

const USD_TO_EUR = 0.92
const fmtTok = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)} k` : `${n}`)
const eur3 = (u: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(u * USD_TO_EUR)

function Tile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="radar-card px-3 py-3">
      <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--radar-text-3)' }}>{label}</p>
      <p className="radar-rounded radar-tnum mt-1 text-[19px] font-bold leading-none" style={{ color: tone ?? 'var(--radar-text)' }}>{value}</p>
      <p className="mt-1 text-[10px]" style={{ color: 'var(--radar-text-3)' }}>{sub}</p>
    </div>
  )
}

/** Onglet Coûts : tableau LIVE de consommation IA & scraping (miroir mobile de
 *  LiveLlmUsagePanel) — tous les providers + connecteurs, budgets/soldes par compte. */
export function RadarCosts() {
  const usage = useUsageStats()
  const monthly = useAiSettingsStore((s) => s.monthlyBudgetUsd)
  const bdBudget = useAiSettingsStore((s) => s.brightDataBudgetUsd)
  const { data: balances } = useQuery({ queryKey: ['providerBalances'], queryFn: fetchProviderBalances, staleTime: 60_000, refetchInterval: 60_000 })
  const { data: bd } = useBrightDataAccount()

  const refetch = usage.refetch
  useEffect(() => { const id = setInterval(() => { void refetch() }, 20_000); return () => clearInterval(id) }, [refetch])

  const built = useMemo(() => {
    const stats = usage.data
    if (!stats) return null
    return buildRadarCostRows({
      stats: stats as unknown as UsageStatsLike,
      monthlyBudgetUsd: monthly as Record<string, number | null>,
      brightDataBudgetUsd: bdBudget,
      balances: balances ?? {},
      brightDataBalanceUsd: bd?.balanceUsd ?? null,
      brightDataConsumedUsd: bd?.consumedThisMonthUsd ?? null,
    })
  }, [usage.data, monthly, bdBudget, balances, bd])

  if (!built) {
    return <div className="radar-card px-5 py-8 text-center text-[13px]" style={{ color: 'var(--radar-text-2)' }}>Chargement de la consommation…</div>
  }
  const { rows, totals } = built
  const alerte = totals.over > 0 ? { t: `${totals.over} over`, c: 'var(--radar-bad)' }
    : totals.warn > 0 ? { t: `${totals.warn} warning`, c: 'var(--radar-warn)' }
    : { t: 'OK', c: 'var(--radar-good)' }

  return (
    <div className="space-y-4">
      <section className="radar-in">
        <div className="mb-3 flex items-center gap-2">
          <Activity size={16} color="var(--radar-good)" />
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-none">Consommation IA & Scraping</h2>
            <p className="mt-0.5 text-[11px]" style={{ color: 'var(--radar-text-3)' }}>{t('rd.costsThisMonth')}</p>
          </div>
          <button onClick={() => void refetch()} aria-label="Actualiser" className="radar-tap ml-auto grid h-8 w-8 place-items-center rounded-full" style={{ background: 'var(--radar-surface-2)', color: 'var(--radar-text-2)' }}>
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Tile label="Total ce mois" value={eur3(totals.totalUsd)} sub={`≈ $${totals.totalUsd.toFixed(4)}`} tone="var(--radar-warn)" />
          <Tile label="Tokens in/out" value={`${fmtTok(totals.tokensIn)}/${fmtTok(totals.tokensOut)}`} sub="providers cumulés" />
          <Tile label="Alertes" value={alerte.t} sub="≥80% warn · ≥100% over" tone={alerte.c} />
        </div>
      </section>

      <ul className="space-y-3 landscape:columns-2 landscape:gap-3 landscape:space-y-0 landscape:[&>*]:mb-3 landscape:[&>*]:break-inside-avoid">
        {rows.map((r) => <RadarCostCard key={r.key} r={r} />)}
      </ul>
    </div>
  )
}
