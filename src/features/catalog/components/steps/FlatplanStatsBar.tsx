// Bandeau de statistiques du chemin de fer + taille des vignettes + reset de
// l'ordre manuel.
import { BookOpen, Grid3X3, Layers, Package, RotateCcw, Star } from 'lucide-react'
import type { FlatplanStats } from '../../catalogFlatplan'

interface Props {
  stats: FlatplanStats
  thumbWidth: number
  onThumbWidth: (w: number) => void
  hasManualOrder: boolean
  onResetOrder: () => void
}

function Stat({ icon, value, label, accent }: { icon: React.ReactNode; value: string | number; label: string; accent?: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${accent ? 'bg-indigo-600/15 text-indigo-300' : 'bg-surface-2 text-muted-foreground'}`}>
      {icon}
      <span className="font-semibold text-white tabular-nums">{value}</span>
      {label}
    </span>
  )
}

export function FlatplanStatsBar({ stats, thumbWidth, onThumbWidth, hasManualOrder, onResetOrder }: Props) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-surface flex-wrap shrink-0">
      <Stat icon={<BookOpen className="w-3.5 h-3.5" />} value={stats.pages} label="pages" accent />
      <Stat icon={<Layers className="w-3.5 h-3.5" />} value={stats.spreads} label="planches" />
      <Stat icon={<Package className="w-3.5 h-3.5" />} value={stats.products} label="produits" />
      <Stat icon={<Grid3X3 className="w-3.5 h-3.5" />} value={stats.openers} label="univers" />
      <Stat icon={<Star className="w-3.5 h-3.5" />} value={stats.featured} label="vedettes" />
      <Stat icon={<Grid3X3 className="w-3.5 h-3.5" />} value={stats.avgPerPage} label="fiches/page (moy.)" />
      <span className="flex-1" />
      {hasManualOrder && (
        <button onClick={onResetOrder}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-muted-foreground hover:text-white hover:bg-surface-2"
          title="Revenir à l'ordre calculé par le moteur">
          <RotateCcw className="w-3.5 h-3.5" /> Ordre auto
        </button>
      )}
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        Vignettes
        <input type="range" min={72} max={200} step={4} value={thumbWidth} onChange={(e) => onThumbWidth(Number(e.target.value))} className="w-24 accent-indigo-500" />
      </label>
    </div>
  )
}
