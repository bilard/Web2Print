// src/features/priceWatch/dashboard/KpiStrip.tsx
// Bandeau de KPI dense. Métriques FIABLES (kpis, non biaisées par le cap ni par le
// filtre). Delta + sparkline vs l'historique. Chiffres en tabular-nums.
import type { KpiHistoryPoint } from '../reportStore'
import type { Cockpit } from './analytics'
import { trendDelta, sparkSeries } from './analytics'
import { eur, pct, when } from './format'
import { Sparkline } from './Sparkline'

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

function Tile({ label, value, sub, accent, delta, spark }: {
  label: string; value: string; sub?: string; accent?: string; delta?: React.ReactNode; spark?: React.ReactNode
}) {
  return (
    <div className="bg-surface rounded-md px-3 py-2.5 border border-white/5 min-w-0">
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
  const holdTxt = ck.priceHoldPct == null ? '—' : `${Math.round(ck.priceHoldPct)} %`
  const expoTxt = ck.exposedPct == null ? '—' : `${Math.round(ck.exposedPct)} %`

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 2xl:grid-cols-8 gap-2">
      <Tile label="Tenue de prix" value={holdTxt} accent="text-emerald-400" sub="aligné ou + bas"
        spark={<Sparkline values={s.hold} color="#34d399" />} />
      <Tile label="Produits exposés" value={expoTxt} accent="text-rose-400"
        sub={`${k.productsUndercut}/${k.products} sous-cotés`}
        delta={d && <Delta cur={d.last.productsUndercut} prev={d.prev.productsUndercut} invert />}
        spark={<Sparkline values={s.undercut} color="#fb7185" />} />
      <Tile label="Écart médian" value={pct(ck.medianGapPct)} accent={signedPctClass(ck.medianGapPct)}
        sub={ck.truncated ? 'sur top 1000' : 'toutes paires'} />
      <Tile label="Impact unitaire" value={eur(ck.totalGapEur)} accent="text-rose-400" sub="Σ écart vs + bas" />
      <Tile label="Produits appariés" value={k.products.toLocaleString('fr-FR')}
        sub={`${k.matchedExact} exact · ${k.matchedOriginOnly} orig.`}
        delta={d && <Delta cur={d.last.products} prev={d.prev.products} />}
        spark={<Sparkline values={s.products} color="#818cf8" />} />
      <Tile label="Concurrents" value={String(ck.competitorsCount)} sub={`${k.comparisons} comparaisons`} />
      <Tile label="Ruptures conc." value={k.ruptures.toLocaleString('fr-FR')} accent="text-amber-400" sub="opportunités" />
      <Tile label="Dernière analyse" value={when(ck.runAt)}
        sub={ck.truncated ? `${ck.totalMatched} appariés (borné)` : `${ck.totalMatched} appariés`} />
    </div>
  )
}
