// src/features/priceWatch/dashboard/KpiCards.tsx
// Bandeau de KPI du tableau de bord. Métrique reine mise en avant : « concurrents
// moins chers que vous » (rose). Delta calculé vs le point de tendance précédent.
import type { StoredReport, KpiHistoryPoint } from '../reportStore'
import { when } from './format'

function Delta({ cur, prev, invert }: { cur: number; prev: number | undefined; invert?: boolean }) {
  if (prev == null || prev === cur) return <span className="text-white/30 text-xs">—</span>
  const up = cur > prev
  // invert : pour « moins cher que vous », une HAUSSE est mauvaise (rose).
  const good = invert ? !up : up
  return (
    <span className={`text-xs ${good ? 'text-emerald-400' : 'text-rose-400'}`}>
      {up ? '▲' : '▼'} {Math.abs(cur - prev).toLocaleString('fr-FR')}
    </span>
  )
}

interface CardProps { label: string; value: string; sub?: string; accent?: string; children?: React.ReactNode }
function Card({ label, value, sub, accent, children }: CardProps) {
  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="text-white/50 text-xs">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${accent ?? 'text-white'}`}>{value}</div>
      <div className="mt-1 flex items-center gap-2">
        {sub && <span className="text-white/40 text-xs">{sub}</span>}
        {children}
      </div>
    </div>
  )
}

export function KpiCards({ report, history }: { report: StoredReport; history: KpiHistoryPoint[] }) {
  const k = report.kpis
  const prev = history.length >= 2 ? history[history.length - 2] : undefined
  const pctUndercut = k.products ? Math.round((k.productsUndercut / k.products) * 100) : 0
  const wellPlaced = k.products - k.productsUndercut

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
      <Card label="Produits appariés" value={k.products.toLocaleString('fr-FR')}
        sub={`${k.matchedExact} exact · ${k.matchedOriginOnly} origine`} />
      <Card label="Concurrents" value={String(report.sites.length)}
        sub={report.truncated ? `liste limitée à ${report.products.length}` : `${report.totalMatched} lignes`} />
      <Card label="Moins chers que vous" value={k.productsUndercut.toLocaleString('fr-FR')} accent="text-rose-400"
        sub={`${pctUndercut}% des appariés`}>
        <Delta cur={k.productsUndercut} prev={prev?.productsUndercut} invert />
      </Card>
      <Card label="Vous êtes bien placé" value={wellPlaced.toLocaleString('fr-FR')} accent="text-emerald-400"
        sub="aligné ou moins cher" />
      <Card label="Ruptures concurrents" value={k.ruptures.toLocaleString('fr-FR')} accent="text-amber-400"
        sub="opportunités" />
      <Card label="Dernière analyse" value={when(report.runAt)} />
    </div>
  )
}
