// src/features/priceWatch/dashboard/KpiStrip.tsx
// Bandeau de KPI dense. Métriques FIABLES (kpis, non biaisées par le cap ni par le
// filtre). Delta + sparkline vs l'historique. Chiffres en tabular-nums.
import type { KpiHistoryPoint } from '../reportStore'
import type { Cockpit } from './analytics'
import { trendDelta, sparkSeries } from './analytics'
import { eur, pct, when } from './format'
import { Sparkline } from './Sparkline'
import { AnimatedNumber } from './AnimatedNumber'

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

const signedPctClass = (v: number | null) =>
  v == null ? 'text-white' : v < -1 ? 'text-rose-400' : v > 1 ? 'text-emerald-400' : 'text-amber-400'

export function KpiStrip({ ck, history }: { ck: Cockpit; history: KpiHistoryPoint[] }) {
  const k = ck.kpis
  const d = trendDelta(history)
  const s = sparkSeries(history)
  const holdTxt = ck.priceHoldPct == null ? '—' : <AnimatedNumber value={ck.priceHoldPct} format={(n) => `${Math.round(n)} %`} />
  const expoTxt = ck.exposedPct == null ? '—' : <AnimatedNumber value={ck.exposedPct} format={(n) => `${Math.round(n)} %`} />

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <Tile label="Tenue prix" value={holdTxt} accent="text-emerald-400" sub="aligné ou + bas"
        spark={<Sparkline values={s.hold} color="#34d399" />} />
      <Tile label="Exposés" value={expoTxt} accent="text-rose-400"
        sub={`${k.productsUndercut}/${k.products} sous-cotés`}
        delta={d && <Delta cur={d.last.productsUndercut} prev={d.prev.productsUndercut} invert />}
        spark={<Sparkline values={s.undercut} color="#fb7185" />} />
      <Tile label="Écart médian" value={ck.medianGapPct == null ? '—' : <AnimatedNumber value={ck.medianGapPct} format={pct} />} accent={signedPctClass(ck.medianGapPct)}
        sub={ck.truncated ? 'sur top 1000' : 'toutes paires'} />
      <Tile label="Impact €" value={<AnimatedNumber value={ck.totalGapEur} format={eur} />} accent="text-rose-400" sub="Σ écart vs + bas" />
      <Tile label="Produits appariés" value={<AnimatedNumber value={k.products} />}
        title={'Vos produits retrouvés chez AU MOINS UN concurrent — comptés une seule fois, '
          + 'même vendus par plusieurs. Le compteur « appariés ici » de chaque site compte, lui, '
          + 'une fois par site : leur somme est donc toujours supérieure à ce total.'}
        sub={`${k.matchedExact} exact · ${k.matchedOriginOnly} orig.`}
        delta={d && <Delta cur={d.last.products} prev={d.prev.products} />}
        spark={<Sparkline values={s.products} color="#818cf8" />} />
      <Tile label="Concurrents" value={<AnimatedNumber value={ck.competitorsCount} />} sub={`${k.comparisons} comparaisons`} />
      <Tile label="Ruptures" value={<AnimatedNumber value={k.ruptures} />} accent="text-amber-400" sub="opportunités" />
      <Tile label="Analyse" value={when(ck.runAt)}
        sub={ck.truncated ? `${ck.totalMatched} appariés (borné)` : `${ck.totalMatched} appariés`}
        spark={
          <span className="flex items-center gap-1 text-[9px] font-medium text-emerald-400/80 tracking-wide" title="Le tableau de bord se met à jour tout seul à chaque analyse — pas besoin de recharger">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> EN DIRECT
          </span>
        } />
    </div>
  )
}
