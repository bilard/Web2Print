// Choix du visuel, de la mesure et de la dimension. Le geste complet (glisser un visuel sur
// la grille, brancher les champs) arrive au lot 2 ; ici on pose une tuile utilisable.
//
// ⚠⚠ `source` DOIT être la source DÉRIVÉE de la feuille active (`effectivePimSource`), pas le
// registre statique : sinon ce menu proposerait des colonnes que le moteur ne connaît pas
// (`useTileData` les rejette avec « Dimension inconnue pour cette source »).
import { useState } from 'react'
import { AlertTriangle, BarChart3, LineChart, PieChart, Hash, Table2, Grid3x3, Plus } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import type { DataSource } from '../registry/types'
import type { TileKind } from '../types'

const KINDS: { kind: TileKind; Icon: typeof BarChart3 }[] = [
  { kind: 'kpi', Icon: Hash }, { kind: 'bar', Icon: BarChart3 }, { kind: 'line', Icon: LineChart },
  { kind: 'pie', Icon: PieChart }, { kind: 'table', Icon: Table2 }, { kind: 'pivot', Icon: Grid3x3 },
]

export function AddTileMenu({ source, onAdd }: {
  source: DataSource
  onAdd: (kind: TileKind, measureId: string, dimensionId?: string) => void
}) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<TileKind>('bar')
  const [measureId, setMeasureId] = useState(source.measures[0].id)
  const [dimensionId, setDimensionId] = useState(source.dimensions[0].id)

  // ⚠ La feuille active peut changer pendant que le menu est ouvert (colonnes différentes) :
  // un `id` choisi avant n'existe alors peut-être plus dans `source`. Se replier sur le
  // premier élément plutôt que de garder un `id` fantôme — sans quoi la tuile créée lèverait
  // à la lecture (« Dimension inconnue pour cette source »).
  const measure = source.measures.find((m) => m.id === measureId) ?? source.measures[0]
  const dimension = source.dimensions.find((d) => d.id === dimensionId) ?? source.dimensions[0]

  // ⚠ Une mesure non agrégeable (médiane, pourcentage) reste CORRECTE calculée par groupe —
  // le moteur agrège les lignes, jamais les valeurs déjà calculées (`aggregate.ts`). Ce
  // qu'elle ne supporte pas, c'est d'être recomposée ENTRE groupes (un total, un empilement).
  // La spec exige que l'interface le dise ; le refus complet du geste est un livrable du
  // constructeur (lot 2) — ici, un avertissement visible suffit.
  const showAggregationWarning = kind !== 'kpi' && !measure.aggregable

  return (
    <div className="bg-surface rounded-lg p-3 flex flex-wrap items-end gap-2">
      <div className="flex items-center gap-1">
        {KINDS.map(({ kind: k, Icon }) => (
          <button
            key={k} onClick={() => setKind(k)} title={t(`bi.kind.${k}` as 'bi.kind.bar')}
            className={`p-1.5 rounded-lg transition-colors ${
              kind === k ? 'bg-indigo-500 text-[#fff]' : 'bg-well text-white/50 hover:text-white'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wider text-white/35">{t('bi.add.measure')}</span>
        <select value={measure.id} onChange={(e) => setMeasureId(e.target.value)}
          className="bg-well border border-white/10 rounded-lg px-2 py-1 text-xs text-white">
          {source.measures.map((m) => <option key={m.id} value={m.id}>{t(m.labelKey)}</option>)}
        </select>
      </label>

      {kind !== 'kpi' && (
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-white/35">{t('bi.add.dimension')}</span>
          <select value={dimension.id} onChange={(e) => setDimensionId(e.target.value)}
            className="bg-well border border-white/10 rounded-lg px-2 py-1 text-xs text-white">
            {source.dimensions.map((d) => (
              <option key={d.id} value={d.id}>{d.label ?? t(d.labelKey)}</option>
            ))}
          </select>
        </label>
      )}

      {showAggregationWarning && (
        <p className="flex items-center gap-1.5 text-[11px] text-amber-200/80 max-w-[220px]">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          {t('bi.add.nonAggregableWarning')}
        </p>
      )}

      <button
        onClick={() => onAdd(kind, measure.id, kind === 'kpi' ? undefined : dimension.id)}
        className="inline-flex items-center gap-1.5 text-xs bg-indigo-500 hover:bg-indigo-600 text-[#fff] rounded-lg px-3 py-1.5 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />{t('bi.add.button')}
      </button>
    </div>
  )
}
