import type { ColumnStats, FieldTypeId } from './types'
import { ArrowDown, ArrowUp, TrendingUp } from 'lucide-react'

interface Props {
  stats: ColumnStats
  fieldType: FieldTypeId
  onSortAsc?: () => void
  onSortDesc?: () => void
  onClearSort?: () => void
  onSortByColor?: () => void
}

const numericTypes: FieldTypeId[] = ['number', 'currency', 'percent', 'rating']

export function StatsBadges({ stats, fieldType, onSortAsc, onSortDesc, onSortByColor }: Props) {
  if (!numericTypes.includes(fieldType)) return null
  if (stats.min === null && stats.max === null) return null

  const formatValue = (v: number | string | null) => {
    if (v === null) return '—'
    if (typeof v === 'string') return v
    if (fieldType === 'currency') return `${v.toLocaleString('fr-FR')} €`
    if (fieldType === 'percent') return `${v}%`
    return v.toLocaleString('fr-FR')
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Min → tri croissant */}
      <button
        onClick={(e) => { e.stopPropagation(); onSortAsc?.() }}
        className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20 hover:bg-blue-500/25 transition-colors cursor-pointer"
        title="Trier croissant (Min → Max)"
      >
        <ArrowDown className="w-2.5 h-2.5" />
        {formatValue(stats.min)}
      </button>

      {/* Avg → tri par zone de couleur */}
      {stats.avg !== null && (
        <button
          onClick={(e) => { e.stopPropagation(); onSortByColor?.() }}
          className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 hover:bg-amber-500/25 transition-colors cursor-pointer"
          title="Trier par couleur (bleu → jaune → vert)"
        >
          <TrendingUp className="w-2.5 h-2.5" />
          {formatValue(stats.avg)}
        </button>
      )}

      {/* Max → tri décroissant */}
      <button
        onClick={(e) => { e.stopPropagation(); onSortDesc?.() }}
        className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25 transition-colors cursor-pointer"
        title="Trier décroissant (Max → Min)"
      >
        <ArrowUp className="w-2.5 h-2.5" />
        {formatValue(stats.max)}
      </button>
    </div>
  )
}

