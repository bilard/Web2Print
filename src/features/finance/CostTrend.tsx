// Évolution mensuelle du coût, empilée par catégorie (LLM / Scraping / Image). Le vrai
// ajout au suivi existant (mois courant seul). ⚠ Jina/Firecrawl (scrapeUsage) n'existent
// qu'à partir de leur instrumentation → mois antérieurs sous-estimés côté Scraping.
import { Bar } from 'react-chartjs-2'
import { Chart, BarElement, CategoryScale, LinearScale, Tooltip, Legend, type TooltipItem } from 'chart.js'
import { useThemeStore } from '@/stores/theme.store'
import type { MonthUsage } from '@/features/stats/useUsageHistory'
import { USD_TO_EUR } from './costModel'
import { t } from '@/lib/i18n'

Chart.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const MONTH_FMT = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit' })
const label = (m: string) => MONTH_FMT.format(new Date(`${m}-01T00:00:00`))
const e = (usd: number) => Math.round(usd * USD_TO_EUR * 100) / 100

export function CostTrend({ history, height = 220 }: { history: MonthUsage[]; height?: number }) {
  const isLight = useThemeStore((s) => s.resolvedTheme === 'light')
  const grid = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'
  const tick = isLight ? '#475569' : 'rgba(255,255,255,0.55)'
  const hasData = history.some((h) => h.totalUsd > 0)

  const data = {
    labels: history.map((h) => label(h.month)),
    datasets: [
      { label: 'LLM', data: history.map((h) => e(h.llmUsd)), backgroundColor: '#818cf8', stack: 's', borderRadius: 3, maxBarThickness: 40 },
      { label: 'Scraping', data: history.map((h) => e(h.scrapeUsd + h.brightDataUsd)), backgroundColor: '#fbbf24', stack: 's', borderRadius: 3, maxBarThickness: 40 },
      { label: 'Image', data: history.map((h) => e(h.removebgUsd)), backgroundColor: '#34d399', stack: 's', borderRadius: 3, maxBarThickness: 40 },
    ],
  }

  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="text-sm font-semibold text-white mb-3">{t('fi.monthlyTrend')}</div>
      {!hasData ? (
        <div className="text-white/40 text-sm py-12 text-center">{t('fi.noHistory')}</div>
      ) : (
        <div style={{ height }}>
          <Bar
            data={data}
            options={{
              maintainAspectRatio: false,
              plugins: {
                legend: { position: 'bottom', labels: { color: tick, boxWidth: 10, boxHeight: 10, font: { size: 10 }, usePointStyle: true } },
                tooltip: { callbacks: { label: (i: TooltipItem<'bar'>) => ` ${i.dataset.label} : ${(i.parsed.y as number).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}` } },
              },
              scales: {
                x: { stacked: true, grid: { display: false }, ticks: { color: tick, font: { size: 10 } } },
                y: { stacked: true, grid: { color: grid }, ticks: { color: tick, font: { size: 10 }, callback: (v) => `${v}€` }, beginAtZero: true },
              },
            }}
          />
        </div>
      )}
    </div>
  )
}
