// ÉVOLUTION de l'indice tarif (base 100 = médiane marché) analyse après analyse.
// La seule courbe qui répond à « est-ce que je dérive ? » d'un coup d'œil : au-dessus de
// la ligne 100 je vends plus cher que le marché, en dessous je vends moins cher.
//
// Ne trace QUE les points portant `pi` (analyses complètes postérieures à la feature) :
// les recalculs partiels (moisson en cours, ▶ d'un site) n'écrivent plus d'historique du
// tout, sinon la courbe racontait la progression du scraping, pas le mouvement des prix.
import { Line } from 'react-chartjs-2'
import { Chart, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip } from 'chart.js'
import { useThemeStore } from '@/stores/theme.store'
import type { KpiHistoryPoint } from '../types'
import { priceIndexSeries } from './analytics'
import { when } from './format'
import { t } from '@/lib/i18n'

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip)

/** Ligne de référence « marché » tracée à 100 (plugin local, pas de dépendance annotation). */
const marketLine = {
  id: 'pw-market-line',
  afterDatasetsDraw(chart: Chart) {
    const y = chart.scales.y
    if (!y || 100 < y.min || 100 > y.max) return
    const { ctx, chartArea } = chart
    const py = y.getPixelForValue(100)
    ctx.save()
    ctx.strokeStyle = 'rgba(148,163,184,0.5)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(chartArea.left, py)
    ctx.lineTo(chartArea.right, py)
    ctx.stroke()
    ctx.restore()
  },
}

export function PriceIndexTrend({ history, height = 220 }: { history: KpiHistoryPoint[]; height?: number }) {
  const isLight = useThemeStore((s) => s.resolvedTheme === 'light')
  const grid = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'
  const tick = isLight ? '#475569' : 'rgba(255,255,255,0.55)'
  const { at, values } = priceIndexSeries(history)
  const enough = values.length >= 2
  const last = values[values.length - 1] ?? null
  const first = values[0] ?? null
  const drift = last != null && first != null ? Math.round((last - first) * 10) / 10 : null

  const data = {
    labels: at.map((t) => when(t)),
    datasets: [{
      label: 'Indice tarif',
      data: values,
      borderColor: '#818cf8',
      backgroundColor: 'rgba(129,140,248,0.12)',
      borderWidth: 2,
      pointRadius: 2,
      tension: 0.25,
      fill: { target: { value: 100 } },
    }],
  }

  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="mb-3">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-sm font-semibold text-white">{t('pw.tail.priceIndexTrend')}</div>
          <div className="text-[11px] text-white/35 tabular-nums">
            {last == null ? 'base 100 = marché' : `${Math.round(last)} aujourd’hui`}
            {drift != null && drift !== 0 && (
              <span className={drift > 0 ? ' text-rose-400' : ' text-emerald-400'}>
                {' '}({drift > 0 ? '+' : ''}{drift.toLocaleString('fr-FR')} pts)
              </span>
            )}
          </div>
        </div>
        {/* Une ligne, la nuance au survol : trois phrases empilées coûtaient deux rangées
            de hauteur sur chaque carte, pour un texte qu'on ne relit pas. */}
        <div className="text-[11px] text-white/40 mt-0.5 truncate" title={`${t('pw.idx.lead')} ${t('pw.idx.undiscounted')}`}>
          {t('pw.idx.lead')}
          <span className="text-rose-400/70"> {t('pw.idx.above')}</span> ·
          <span className="text-emerald-400/70"> {t('pw.idx.below')}</span>
        </div>
      </div>
      {!enough ? (
        <div className="text-white/40 text-sm py-12 text-center px-4">
          {t('pw.idx.empty')}
        </div>
      ) : (
        <div style={{ height }}>
          <Line
            data={data}
            plugins={[marketLine]}
            options={{
              maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              plugins: {
                tooltip: {
                  callbacks: {
                    title: (items) => `${items[0]?.label ?? ''} — indice tarif`,
                    label: (item) => {
                      const v = item.parsed.y
                      if (v == null) return 'non relevé'
                      const d = Math.round((v - 100) * 10) / 10
                      if (Math.abs(d) < 0.5) return `${Math.round(v)} — au niveau du marché`
                      return `${Math.round(v)} — ${Math.abs(d).toLocaleString('fr-FR')} % ${d > 0 ? 'plus cher' : 'moins cher'} que le marché`
                    },
                  },
                },
              },
              scales: {
                x: { grid: { display: false }, ticks: { color: tick, font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
                y: { grid: { color: grid }, ticks: { color: tick, font: { size: 10 } } },
              },
            }}
          />
        </div>
      )}
    </div>
  )
}
