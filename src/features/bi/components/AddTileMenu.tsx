// Choix du visuel, de la mesure et de la dimension. Le geste complet (glisser un champ dans
// une zone de dépôt) arrive avec le constructeur ; ici on pose une tuile utilisable.
//
// ⚠⚠ `source` DOIT être la source DÉRIVÉE de la feuille active (`effectivePimSource`), pas le
// registre statique : sinon ce menu proposerait des colonnes que le moteur ne connaît pas
// (`useTileData` les rejette avec « Dimension inconnue pour cette source »).
import { useMemo, useState } from 'react'
import { AlertTriangle, BarChart3, LineChart, PieChart, Hash, Table2, Grid3x3, Plus } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { BiPicker, type PickerOption } from './BiPicker'
import { biLabel } from './biLabel'
import type { DataSource, Measure } from '../registry/types'
import type { MeasureRef, TileKind } from '../types'

const KINDS: { kind: TileKind; Icon: typeof BarChart3 }[] = [
  { kind: 'kpi', Icon: Hash }, { kind: 'bar', Icon: BarChart3 }, { kind: 'line', Icon: LineChart },
  { kind: 'pie', Icon: PieChart }, { kind: 'table', Icon: Table2 }, { kind: 'pivot', Icon: Grid3x3 },
]

/** Une mesure du registre → la `MeasureRef` que la tuile enregistre : la colonne et son
 *  agrégation pour une mesure dérivée, l'identifiant pour une mesure déclarée. */
const refOf = (m: Measure): MeasureRef => m.derivedFrom ?? { id: m.id }

export function AddTileMenu({ source, onAdd }: {
  source: DataSource
  onAdd: (kind: TileKind, measure: MeasureRef, dimensionId?: string, columnDimensionId?: string) => void
}) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<TileKind>('bar')
  const [measureId, setMeasureId] = useState(source.measures[0].id)
  const [dimensionId, setDimensionId] = useState(source.dimensions[0].id)
  const [columnDimensionId, setColumnDimensionId] = useState<string | null>(null)

  // ⚠ La feuille active peut changer pendant que le menu est ouvert (colonnes différentes) :
  // un `id` choisi avant n'existe alors peut-être plus dans `source`. Se replier sur le
  // premier élément plutôt que de garder un `id` fantôme — sans quoi la tuile créée lèverait
  // à la lecture (« Dimension inconnue pour cette source »).
  const measure = source.measures.find((m) => m.id === measureId) ?? source.measures[0]
  const dimension = source.dimensions.find((d) => d.id === dimensionId) ?? source.dimensions[0]

  // ⚠⚠ Les mesures DÉRIVÉES sont groupées PAR COLONNE : sur un catalogue de 21 colonnes, la
  // liste dépasse la centaine d'entrées, et « Somme », « Moyenne », « Médiane » répétés vingt
  // fois d'affilée sans en-tête ne se lisent pas. `BiPicker` ouvre sa recherche au-delà de dix.
  const measureOptions = useMemo<PickerOption[]>(() => source.measures.map((m) => ({
    id: m.id,
    label: biLabel(m, t),
    group: m.label ?? t('bi.measure.declared'),
  })), [source.measures, t])
  const dimensionOptions = useMemo<PickerOption[]>(
    () => source.dimensions.map((d) => ({ id: d.id, label: biLabel(d, t) })), [source.dimensions, t])

  // ⚠⚠ Le tableau croisé exige DEUX axes : sans second choix, toute tuile « croisé » créée
  // ici n'affichait que « un tableau croisé demande deux dimensions ». Les candidats
  // excluent l'axe des lignes — se croiser avec soi-même ne produit aucun croisement.
  const columnCandidates = source.dimensions.filter((d) => d.id !== dimension.id)
  const columnDimension = kind === 'pivot'
    ? columnCandidates.find((d) => d.id === columnDimensionId) ?? columnCandidates[0]
    : undefined

  // ⚠ Une mesure non agrégeable (médiane, pourcentage) reste CORRECTE calculée par groupe —
  // le moteur agrège les lignes, jamais les valeurs déjà calculées (`aggregate.ts`). Ce
  // qu'elle ne supporte pas, c'est d'être recomposée ENTRE groupes (un total, un empilement).
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

      <BiPicker
        label={t('bi.add.measure')} value={measure.id}
        options={measureOptions} onChange={setMeasureId}
      />

      {kind !== 'kpi' && (
        <BiPicker
          label={t('bi.add.dimension')} value={dimension.id}
          options={dimensionOptions} onChange={setDimensionId}
        />
      )}

      {kind === 'pivot' && columnDimension && (
        <BiPicker
          label={t('bi.add.columnDimension')} value={columnDimension.id}
          options={dimensionOptions.filter((o) => o.id !== dimension.id)}
          onChange={setColumnDimensionId}
        />
      )}

      {showAggregationWarning && (
        <p className="flex items-center gap-1.5 text-[11px] text-amber-200/80 max-w-[220px]">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          {t('bi.add.nonAggregableWarning')}
        </p>
      )}

      <button
        onClick={() => onAdd(
          kind, refOf(measure),
          kind === 'kpi' ? undefined : dimension.id,
          columnDimension?.id,
        )}
        className="inline-flex items-center gap-1.5 text-xs bg-indigo-500 hover:bg-indigo-600 text-[#fff] rounded-lg px-3 py-1.5 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />{t('bi.add.button')}
      </button>
    </div>
  )
}
