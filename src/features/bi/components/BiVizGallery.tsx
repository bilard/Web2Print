// Galerie des types de visuel. Cliquer un type CHANGE celui de la tuile sélectionnée.
//
// ⚠⚠ Les types sont ceux du contrat (`TILE_KINDS`), jamais une liste décorative : une
// vignette qui ne correspondrait à aucun `TileKind` produirait une tuile refusée par
// `parseDashboard`, donc invisible sans un mot.
import { BarChart3, LineChart, AreaChart, PieChart, Donut, Hash, Table2, Grid3x3,
  Gauge, ScatterChart, Filter, LayoutGrid } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import type { TranslationKey } from '@/lib/i18n'
import type { TileKind } from '../types'

const KINDS: { kind: TileKind; labelKey: TranslationKey; Icon: typeof BarChart3 }[] = [
  { kind: 'bar', labelKey: 'bi.kind.bar', Icon: BarChart3 },
  { kind: 'line', labelKey: 'bi.kind.line', Icon: LineChart },
  { kind: 'area', labelKey: 'bi.kind.area', Icon: AreaChart },
  { kind: 'pie', labelKey: 'bi.kind.pie', Icon: PieChart },
  { kind: 'doughnut', labelKey: 'bi.kind.doughnut', Icon: Donut },
  { kind: 'kpi', labelKey: 'bi.kind.kpi', Icon: Hash },
  { kind: 'table', labelKey: 'bi.kind.table', Icon: Table2 },
  { kind: 'pivot', labelKey: 'bi.kind.pivot', Icon: Grid3x3 },
  { kind: 'gauge', labelKey: 'bi.kind.gauge', Icon: Gauge },
  { kind: 'scatter', labelKey: 'bi.kind.scatter', Icon: ScatterChart },
  { kind: 'funnel', labelKey: 'bi.kind.funnel', Icon: Filter },
  { kind: 'heatmap', labelKey: 'bi.kind.heatmap', Icon: LayoutGrid },
]

export function BiVizGallery({ kind, onChange, disabled }: {
  /** Type de la tuile sélectionnée. `null` = aucune tuile choisie. */
  kind: TileKind | null
  onChange: (kind: TileKind) => void
  /** Consultation, ou aucune tuile sélectionnée : la galerie se montre sans agir. */
  disabled: boolean
}) {
  const { t } = useTranslation()
  return (
    <div role="group" aria-label={t('bi.visuals.type')} className="grid grid-cols-6 gap-1">
      {KINDS.map(({ kind: k, labelKey, Icon }) => {
        const on = k === kind
        return (
          <button
            key={k} type="button" disabled={disabled} aria-pressed={on}
            title={t(labelKey)} aria-label={t(labelKey)}
            onClick={() => onChange(k)}
            className={`aspect-square grid place-items-center rounded-md border transition-colors ${
              on
                ? 'border-indigo-500 bg-indigo-500/15 text-indigo-400'
                : 'border-white/[0.06] bg-well text-white/45 enabled:hover:text-white enabled:hover:border-white/15'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        )
      })}
    </div>
  )
}

/** Réexporté pour que le volet nomme le type sélectionné sans redéclarer la table. */
export function kindLabelKey(kind: TileKind): TranslationKey {
  return KINDS.find((k) => k.kind === kind)?.labelKey ?? 'bi.kind.bar'
}
