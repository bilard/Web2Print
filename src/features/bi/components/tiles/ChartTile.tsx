// Barres, courbes, aires, camemberts — sur `chart.js`, déjà au projet et déjà utilisé par
// le node « Graphique ». ⚠ Les couleurs de texte et de grille suivent le THÈME : lues
// depuis le store, jamais écrites en dur.
//
// ⚠⚠ Les mesures d'INFO-BULLE (`query.tooltips`) traversent le moteur comme les autres —
// c'est la seule façon de les faire calculer — mais elles sont ÉCARTÉES des séries et ne
// paraissent qu'au survol. Sans cette mise à l'écart, la zone « Info-bulles » tracerait des
// barres, c'est-à-dire exactement ce qu'elle promet de ne pas faire.
import { useMemo } from 'react'
import { Bar, Line, Pie, Doughnut } from 'react-chartjs-2'
import {
  Chart, CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement,
  Tooltip, Legend, Filler,
} from 'chart.js'
import type { ChartEvent, ChartType, TooltipItem } from 'chart.js'
import { useThemeStore } from '@/stores/theme.store'
import { intlLocale, useTranslation } from '@/lib/i18n'
import { formatMeasure } from '../../engine/formatValue'
import { biLabel } from '../biLabel'
import { installChartVisibilityRepair } from '@/lib/chartVisibility'
import { chartModel } from './chartData'
import type { AggregateResult } from '../../engine/aggregate'
import type { TileKind } from '../../types'

Chart.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement,
  Tooltip, Legend, Filler)
// ⚠⚠ Un graphe monté pendant que l'onglet est masqué garde des zones cliquables de hauteur
// NULLE : plus aucun clic ne filtre. La réparation se pose une fois, au retour de l'onglet.
installChartVisibilityRepair()

const EMPTY: ReadonlySet<string> = new Set()

export function ChartTile({ result, kind, stacked, horizontal, tooltipKeys, onPick, onDrill }: {
  result: AggregateResult; kind: TileKind; stacked?: boolean
  /** Barres couchées : l'axe des CATÉGORIES passe en vertical. */
  horizontal?: boolean
  /** Clés des mesures montrées AU SURVOL seulement. */
  tooltipKeys?: ReadonlySet<string>
  /**
   * Clic sur une barre, une part ou un point : la valeur de la dimension sous le curseur.
   *
   * ⚠ La tuile ne décide de RIEN — elle rapporte ce qui a été cliqué. C'est le tableau de
   * bord qui en fait un filtre, l'applique aux autres tuiles et l'affiche dans le bandeau ;
   * sans cela, un filtre pourrait exister sans se voir, ce qui fait mentir tous les chiffres
   * de la page.
   */
  onPick?: (field: string, value: string | null) => void
  /** Double-clic sur un élément : descendre d'un niveau dans la hiérarchie de l'axe.
   *  ⚠ Distinct du clic simple, qui filtre : deux gestes, deux intentions. */
  onDrill?: (value: string | null) => void
}) {
  const { t, locale } = useTranslation()
  const dark = useThemeStore((s) => s.resolvedTheme) === 'dark'
  const tick = dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.55)'
  const grid = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'
  const hidden = tooltipKeys ?? EMPTY

  // ⚠ La mémoïsation ne tient QUE si `result` et `hidden` sont stables : `useTileData`
  // mémoïse le premier, `DashboardGrid` le second. `t` est bien en dépendance ici — ce
  // composant ne rend que la tuile SÉLECTIONNÉE ou visible, jamais une agrégation.
  const model = useMemo(() => chartModel(result, kind, (c) => biLabel(c, t), hidden),
    [result, kind, hidden, t])
  const tips = result.columns.filter((c) => c.role === 'measure' && hidden.has(c.key))

  const data = { labels: model.labels, datasets: model.datasets }
  // ⚠ `indexAxis: 'y'` COUCHE les barres : chart.js échange alors le rôle des deux échelles
  // tout seul — l'axe des catégories devient `y`, celui des valeurs `x`. Rien d'autre à
  // inverser ici, et surtout pas les titres d'axes, qu'il repositionne avec.
  const options = {
    indexAxis: horizontal && kind === 'bar' ? ('y' as const) : ('x' as const),
    maintainAspectRatio: false,
    plugins: {
      // ⚠ Camembert/anneau nomment leurs tranches par la LÉGENDE (les labels de `data`,
      // pas le libellé de la série) : à une seule mesure, elle reste nécessaire.
      legend: {
        display: model.datasets.length > 1 || kind === 'pie' || kind === 'doughnut',
        labels: { color: tick, boxWidth: 10 },
      },
      tooltip: {
        callbacks: {
          // ⚠ Le même callback sert aux 4 types de graphe : `parsed` est un nombre brut sur
          // camembert/anneau, un point {x,y} sur barres/courbes — d'où la garde de forme.
          label: (c: TooltipItem<ChartType>) => {
            const parsed: unknown = c.parsed
            const value = typeof parsed === 'number'
              ? parsed
              : typeof parsed === 'object' && parsed !== null && 'y' in parsed
                && typeof (parsed as { y?: unknown }).y === 'number'
                ? (parsed as { y: number }).y
                : Number(c.raw)
            const format = model.formatOf(c.datasetIndex)
            return `${c.dataset.label ?? ''} : ${formatMeasure(value, format, intlLocale(locale))}`
          },
          // Les mesures de la zone « Info-bulles », sous la valeur survolée.
          afterBody: (items: TooltipItem<ChartType>[]) => {
            if (tips.length === 0 || items.length === 0) return []
            const row = model.rowAt(items[0].datasetIndex, items[0].dataIndex)
            if (!row) return []
            return tips.map((m) => {
              const v = row[m.key]
              return `${biLabel(m, t)} : ${formatMeasure(typeof v === 'number' ? v : null, m.format, intlLocale(locale))}`
            })
          },
        },
      },
    },
    scales: kind === 'pie' || kind === 'doughnut' ? undefined : {
      x: { stacked, ticks: { color: tick }, grid: { color: grid } },
      y: { stacked, ticks: { color: tick }, grid: { color: grid } },
    },
    // Filtrage croisé : ce qui est cliqué est rapporté, jamais interprété ici.
    // ⚠ `onPick` absent ⇒ pas de curseur « main » : une tuile qui a l'air cliquable sans
    // l'être est plus déroutante qu'une tuile inerte.
    onClick: onPick
      ? (e: ChartEvent, els: { index: number }[], chart: Chart) => {
          // ⚠⚠ `els` vient des éléments ACTIFS, que chart.js ne renseigne qu'au `mousemove`.
          // Au doigt (tablette, mode TV) ou sur un clic qui n'a pas été précédé d'un survol,
          // il arrive VIDE : le filtrage croisé était alors muet, sans rien qui le dise.
          // On retrouve donc l'élément sous le pointeur par l'API du graphe, comme le fait
          // déjà le double-clic.
          // ⚠ `intersect: false` dans ce repli SEULEMENT : un doigt ne vise pas une barre
          // de 17 px, il faut lui donner l'élément le plus PROCHE. Le chemin normal (souris,
          // `els` renseigné par le survol) n'est pas concerné.
          const el = els[0] ?? (e.native
            ? chart.getElementsAtEventForMode(e.native, 'nearest', { intersect: false }, false)[0]
            : undefined)
          if (!el) return
          const value = model.dimensionValueAt(el.index)
          if (value !== undefined) onPick(model.dimensionKey ?? '', value)
        }
      : undefined,
  }
  const cursor = onPick || onDrill ? { cursor: 'pointer' } : undefined
  // ⚠ chart.js n'a pas de « double-clic » : on écoute celui du conteneur et on retrouve
  // l'élément sous le pointeur par sa propre API — sinon il faudrait deviner la barre.
  const onDoubleClick = onDrill
    ? (e: React.MouseEvent<HTMLCanvasElement>) => {
        const chart = Chart.getChart(e.currentTarget)
        const els = chart?.getElementsAtEventForMode(
          e.nativeEvent, 'nearest', { intersect: true }, false) ?? []
        const el = els[0]
        if (!el) return
        const value = model.dimensionValueAt(el.index)
        if (value !== undefined) onDrill(value)
      }
    : undefined

  // ⚠⚠ Un camembert RÉPARTIT un total entre les valeurs d'une dimension : sans axe, il n'a
  // qu'une part et dessine un DISQUE PLEIN d'une seule couleur. Vu à l'écran en basculant un
  // indicateur (qui n'a jamais d'axe, cf. `wellCapacity`) vers le camembert : le visuel
  // semblait en panne alors qu'il montrait fidèlement « 100 % du total ». On le dit.
  if ((kind === 'pie' || kind === 'doughnut') && !model.dimensionKey) {
    return (
      <p className="grid h-full place-items-center px-4 text-center text-[11px] text-white/35">
        {t('bi.pie.needsDimension')}
      </p>
    )
  }
  if (kind === 'pie') return <Pie data={data} options={options} style={cursor} onDoubleClick={onDoubleClick} />
  if (kind === 'doughnut') return <Doughnut data={data} options={options} style={cursor} onDoubleClick={onDoubleClick} />
  if (kind === 'line' || kind === 'area') return <Line data={data} options={options} style={cursor} onDoubleClick={onDoubleClick} />
  return <Bar data={data} options={options} style={cursor} onDoubleClick={onDoubleClick} />
}
