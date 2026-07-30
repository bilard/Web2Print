import { Package, AlertTriangle, PlusCircle, BadgeCheck, CheckCircle2 } from 'lucide-react'
import type { InsightsData } from './insightsAggregate'
import { t } from '@/lib/i18n'

interface Props {
  data: InsightsData
}

const pct = (n: number, d: number): string => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—')

/** Bandeau de KPI têtes de gondole : produits vérifiés + les DEUX types d'écart
 *  (divergence & apport fabricant), plus EAN certifié et écarts résolus. */
export function InsightsKpiCards({ data }: Props) {
  const totalFields = data.matchFields + data.divergentFields + data.completedFields
  const cards = [
    { icon: Package, tint: 'text-sky-400', bg: 'bg-sky-500/10',
      value: String(data.verifiedCount), label: t('mv.insights.verifiedProducts'),
      sub: `${data.eanMatched} au même EAN certifié` },
    { icon: AlertTriangle, tint: 'text-amber-400', bg: 'bg-amber-500/10',
      value: String(data.divergentFields), label: 'Champs divergents',
      sub: `${data.identityDivergentProducts} produit(s) à identité divergente` },
    { icon: PlusCircle, tint: 'text-indigo-300', bg: 'bg-indigo-500/10',
      value: String(data.completedFields), label: 'Apports fabricant',
      sub: `données absentes de la source` },
    { icon: CheckCircle2, tint: 'text-emerald-400', bg: 'bg-emerald-500/10',
      value: pct(data.matchFields, totalFields), label: 'Taux de concordance',
      sub: `${data.matchFields} champs identiques` },
    { icon: BadgeCheck, tint: 'text-teal-400', bg: 'bg-teal-500/10',
      value: String(data.adoptedTotal), label: t('mv.insights.resolvedGaps'),
      sub: `valeurs fabricant promues` },
  ]
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="bg-surface border border-white/10 rounded-xl p-4">
          <div className={`w-9 h-9 rounded-lg ${c.bg} flex items-center justify-center mb-3`}>
            <c.icon className={`w-5 h-5 ${c.tint}`} />
          </div>
          <div className="text-2xl font-bold tabular-nums">{c.value}</div>
          <div className="text-sm font-medium text-white/80 mt-0.5">{c.label}</div>
          <div className="text-xs text-white/45 mt-1">{c.sub}</div>
        </div>
      ))}
    </div>
  )
}
