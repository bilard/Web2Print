// src/features/finance/FinancePanel.tsx
// Tableau de bord FINANCES : coûts réels + tokens par connecteur (LLM, Jina, Firecrawl,
// Bright Data, Remove.bg), budgets/restant, historique mensuel. Global à l'app : les
// coûts sont trackés par provider/mois, JAMAIS par run → non rattachables à un module.
import { useUsageStats } from '@/features/stats/useUsageStats'
import { useUsageHistory } from '@/features/stats/useUsageHistory'
import { useAiSettingsStore } from '@/stores/aiSettings.store'
import { buildCostRows, costTotals, eur } from './costModel'
import { CostTrend } from './CostTrend'
import { ConnectorTable } from './ConnectorTable'
import { Loader2 } from 'lucide-react'

const fmtTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M` :
  n >= 1_000 ? `${(n / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} k` : String(n)

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-surface rounded-md px-3 py-2.5 border border-white/5">
      <div className="text-white/40 text-[10px] uppercase tracking-wide">{label}</div>
      <div className={`text-xl font-semibold leading-tight mt-0.5 tabular-nums ${accent ?? 'text-white'}`}>{value}</div>
      {sub && <div className="text-white/35 text-[11px] mt-0.5">{sub}</div>}
    </div>
  )
}

export function FinancePanel() {
  const { data: stats, isLoading } = useUsageStats()
  const { data: history } = useUsageHistory(6)
  const monthlyBudgetUsd = useAiSettingsStore((s) => s.monthlyBudgetUsd)
  const brightDataBudgetUsd = useAiSettingsStore((s) => s.brightDataBudgetUsd)

  if (isLoading || !stats) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-indigo-400 animate-spin" /></div>
  }

  const rows = buildCostRows(stats, { monthlyBudgetUsd, brightDataBudgetUsd })
  const totals = costTotals(stats)
  const budgeted = rows.filter((r) => r.budgetUsd != null)
  const remaining = budgeted.reduce((n, r) => n + (r.remainingUsd ?? 0), 0)
  const monthLabel = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date())

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold text-white">Finances</h1>
        <p className="text-sm text-white/50">
          Suivi réel des coûts et tokens par connecteur — {monthLabel}. Les coûts sont agrégés
          par connecteur et par mois à l’échelle de l’app (non rattachables à un module précis).
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Tile label={`Coût total · ${monthLabel}`} value={eur(totals.totalUsd)} accent="text-white"
          sub={`LLM ${eur(totals.byGroup.LLM)} · Scraping ${eur(totals.byGroup.Scraping)}`} />
        <Tile label="Tokens LLM" value={fmtTokens(totals.tokensLlm)} sub="entrée + sortie ce mois" />
        <Tile label="Scraping" value={eur(totals.byGroup.Scraping)} accent="text-amber-400" sub="Jina · Firecrawl · Bright Data" />
        <Tile label="Budget restant" value={budgeted.length ? eur(remaining) : '—'} accent="text-emerald-400"
          sub={budgeted.length ? `sur ${budgeted.length} connecteur(s) plafonné(s)` : 'aucun plafond défini'} />
      </div>

      <CostTrend history={history ?? []} />
      <ConnectorTable rows={rows} />
    </div>
  )
}
