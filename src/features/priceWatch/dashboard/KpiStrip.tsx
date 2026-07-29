// Bandeau de KPI dense. Métriques FIABLES (kpis, non biaisées par le cap ni par le
// filtre). Delta + sparkline vs l'historique. Chiffres en tabular-nums.
import type { KpiHistoryPoint } from '../types'
import type { Cockpit } from './analytics'
import { trendDelta, sparkSeries } from './analytics'
import { eur, pct, when } from './format'
import { Sparkline } from './Sparkline'
import { AnimatedNumber } from './AnimatedNumber'
import { useTranslation } from '@/lib/i18n'

function Delta({ cur, prev, invert }: { cur: number; prev: number | undefined; invert?: boolean }) {
  if (prev == null || prev === cur) return null
  const up = cur > prev
  const good = invert ? !up : up
  return (
    <span className={`text-[11px] tabular-nums ${good ? 'text-emerald-400' : 'text-rose-400'}`}>
      {up ? '▲' : '▼'}{Math.abs(cur - prev).toLocaleString('fr-FR')}
    </span>
  )
}

function Tile({ label, value, sub, accent, delta, spark, title }: {
  label: string; value: React.ReactNode; sub?: string; accent?: string; delta?: React.ReactNode; spark?: React.ReactNode
  /** Infobulle — sert à lever les ambiguïtés de comptage (produits vs paires). */
  title?: string
}) {
  return (
    <div className="bg-surface rounded-md px-3 py-2.5 border border-white/5 min-w-0" title={title}>
      <div className="flex items-start justify-between gap-1">
        <div className="text-white/40 text-[10px] uppercase tracking-wide truncate">{label}</div>
        {spark}
      </div>
      <div className={`text-xl font-semibold leading-tight mt-0.5 tabular-nums ${accent ?? 'text-white'}`}>{value}</div>
      <div className="mt-0.5 flex items-center gap-1.5 min-h-[14px]">
        {sub && <span className="text-white/35 text-[11px] truncate">{sub}</span>}
        {delta}
      </div>
    </div>
  )
}

/** Indice tarif : > 100 = je vends plus cher que le marché (alerte), < 100 = en dessous. */
const indexClass = (v: number | null) =>
  v == null ? 'text-white' : v > 101 ? 'text-rose-400' : v < 99 ? 'text-emerald-400' : 'text-amber-400'

// Constante de MODULE : on stocke la CLÉ, la traduction se fait au rendu.
const INDEX_TITLE_KEY = 'pw.kpi.index.title' as const

export function KpiStrip({ ck, history }: { ck: Cockpit; history: KpiHistoryPoint[] }) {
  const { t } = useTranslation()
  const k = ck.kpis
  const d = trendDelta(history)
  const s = sparkSeries(history)
  const holdTxt = ck.priceHoldPct == null ? '—' : <AnimatedNumber value={ck.priceHoldPct} format={(n) => `${Math.round(n)} %`} />
  const expoTxt = ck.exposedPct == null ? '—' : <AnimatedNumber value={ck.exposedPct} format={(n) => `${Math.round(n)} %`} />

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <Tile label={t('pw.kpi.priceHold')} value={holdTxt} accent="text-emerald-400" sub={t('pw.kpi.priceHold.sub')}
        spark={<Sparkline values={s.hold} color="#34d399" />} />
      <Tile label={t('pw.kpi.exposed')} value={expoTxt} accent="text-rose-400"
        sub={t('pw.kpi.exposed.sub', { under: k.productsUndercut, total: k.products })}
        delta={d && <Delta cur={d.last.productsUndercut} prev={d.prev.productsUndercut} invert />}
        spark={<Sparkline values={s.undercut} color="#fb7185" />} />
      {/* L'indice tarif REMPLACE l'écart médian en tête : même lecture (« où je me situe »),
          mais calculé sur le catalogue complet — donc juste même quand le rapport est
          tronqué. L'écart médian, biaisé, reste en sous-titre pour continuité de lecture. */}
      <Tile label={t('pw.kpi.index')} title={t(INDEX_TITLE_KEY)}
        value={ck.priceIndex == null ? '—' : <AnimatedNumber value={ck.priceIndex} format={(n) => Math.round(n).toLocaleString('fr-FR')} />}
        accent={indexClass(ck.priceIndex)}
        sub={ck.priceIndexBest == null ? t('pw.kpi.index.sub') : t('pw.kpi.index.sub2', { index: Math.round(ck.priceIndexBest) })}
        spark={ck.priceIndexBiased
          ? <span className="text-[9px] text-amber-400/80" title={t('pw.kpi.index.stale')}>≈</span>
          : <Sparkline values={s.index} color="#818cf8" />} />
      <Tile label={t('pw.kpi.gap')} value={<AnimatedNumber value={ck.totalGapEur} format={eur} />} accent="text-rose-400"
        sub={t('pw.kpi.gap.sub', { median: ck.medianGapPct == null ? '—' : pct(ck.medianGapPct) })}
        title={t('pw.kpi.gap.title') + (ck.truncated ? t('pw.kpi.gap.truncated') : '.')} />
      <Tile label={t('pw.kpi.matched')} value={<AnimatedNumber value={k.products} />}
        title={t('pw.kpi.matched.title')}
        sub={t('pw.kpi.matched.sub', { exact: k.matchedExact, orig: k.matchedOriginOnly })}
        delta={d && <Delta cur={d.last.products} prev={d.prev.products} />}
        spark={<Sparkline values={s.products} color="#818cf8" />} />
      <Tile label={t('pw.kpi.competitors')} value={<AnimatedNumber value={ck.competitorsCount} />} sub={t('pw.kpi.competitors.sub', { count: k.comparisons })} />
      <Tile label={t('pw.kpi.outOfStock')} value={<AnimatedNumber value={k.ruptures} />} accent="text-amber-400" sub={t('pw.kpi.outOfStock.sub')} />
      <Tile label={t('pw.kpi.analysis')} value={when(ck.runAt)}
        sub={t(ck.truncated ? 'pw.kpi.analysis.sub.truncated' : 'pw.kpi.analysis.sub', { count: ck.totalMatched })}
        spark={
          <span className="flex items-center gap-1 text-[9px] font-medium text-emerald-400/80 tracking-wide" title={t('pw.kpi.autoRefresh')}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> {t('pw.kpi.live')}
          </span>
        } />
    </div>
  )
}
