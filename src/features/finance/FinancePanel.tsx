// Tableau de bord FINANCES : coûts réels + tokens par connecteur (LLM, Jina, Firecrawl,
// Bright Data, Remove.bg), budgets/restant, historique mensuel. Global à l'app : les
// coûts sont trackés par provider/mois, JAMAIS par run → non rattachables à un module.
import { useUsageStats } from '@/features/stats/useUsageStats'
import { useUsageHistory } from '@/features/stats/useUsageHistory'
import { useAiSettingsStore } from '@/stores/aiSettings.store'
import { buildCostRows, costTotals, eur } from './costModel'
import { CostTrend } from './CostTrend'
import { ConnectorTable } from './ConnectorTable'
import { BillingLinks } from './BillingLinks'
import { ExpandableChart } from '@/components/shared/ExpandableChart'
import { Loader2 } from 'lucide-react'
import { useTranslation, intlLocale, type Locale } from '@/lib/i18n'

// ⚠️ Le séparateur de milliers et le nom du mois suivent la LANGUE, pas le pays
// des factures : « 1,2 M » en français, « 1.2 M » en anglais. Un `fr-FR` en dur
// affichait « juillet 2026 » au milieu d'un écran espagnol.
const fmtTokens = (n: number, locale: Locale) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString(intlLocale(locale), { maximumFractionDigits: 1 })} M` :
  n >= 1_000 ? `${(n / 1_000).toLocaleString(intlLocale(locale), { maximumFractionDigits: 0 })} k` : String(n)

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
  const { t, locale } = useTranslation()
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
  const monthLabel = new Intl.DateTimeFormat(intlLocale(locale), { month: 'long', year: 'numeric' }).format(new Date())

  return (
    <div className="space-y-3">
      <header className="sticky top-0 z-20 -mx-8 px-8 pt-8 pb-3 -mt-8 mb-1 bg-background border-b border-white/[0.06]">
        <h1 className="text-xl font-semibold text-white">{t('fin.title')}</h1>
        <p className="text-sm text-white/50">{t('fin.lead', { month: monthLabel })}</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Tile label={t('fin.tile.total', { month: monthLabel })} value={eur(totals.totalUsd)} accent="text-white"
          sub={t('fin.tile.totalSub', { llm: eur(totals.byGroup.LLM), scraping: eur(totals.byGroup.Scraping) })} />
        <Tile label={t('fin.tile.tokens')} value={fmtTokens(totals.tokensLlm, locale)} sub={t('fin.tile.tokensSub')} />
        <Tile label={t('fin.tile.scraping')} value={eur(totals.byGroup.Scraping)} accent="text-amber-400" sub="Jina · Firecrawl · Bright Data" />
        <Tile label={t('fin.tile.remaining')} value={budgeted.length ? eur(remaining) : '—'} accent="text-emerald-400"
          sub={budgeted.length ? t('fin.tile.remainingSub', { count: budgeted.length }) : t('fin.tile.noCap')} />
      </div>

      <BillingLinks />
      <ExpandableChart render={(h) => <CostTrend history={history ?? []} height={h} />} />
      <ConnectorTable rows={rows} />
    </div>
  )
}
