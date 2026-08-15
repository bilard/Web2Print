// Planche de rendu des visuels BI : chaque tuile y est montée avec un jeu d'exemple, dans
// une boîte marquée `data-shot`. C'est `scripts/bi-doc/build.mjs` qui la photographie, tuile
// par tuile, pour composer la documentation PDF.
//
// ⚠⚠ Les composants sont les VRAIS, montés depuis `src` : une planche qui redessinerait les
// visuels à la main documenterait une application qui n'existe pas. Le jour où un visuel
// change, la documentation change avec — ou la capture échoue, ce qui se voit.
//
// ⚠ Jeu d'exemple UNIQUE et cohérent (huit concurrents, leurs volumes, leurs écarts) : le
// lecteur retrouve les mêmes chiffres d'un visuel à l'autre et compare ce que chacun montre.
import { createRoot } from 'react-dom/client'
import type { ReactNode } from 'react'
import '../../src/index.css'
import { useLocaleStore } from '../../src/stores/locale.store'
import { TileVisual } from '../../src/features/bi/components/TileVisual'
import type { AggregateResult } from '../../src/features/bi/engine/aggregate'
import type { Tile, TileKind } from '../../src/features/bi/types'

// ⚠ Locale forcée : la documentation est française, et un « 534,735 » à l'anglaise dans une
// illustration ferait douter du reste.
useLocaleStore.setState({ locale: 'fr' })

const SITES = ['webmotoculture', 'matijardin', 'jardimax', 'emc-motoculture',
  '190cc', 'progarden', 'sos-accessoire', 'dppmsas']

const columns = (list: [string, string, string, string?][]): AggregateResult['columns'] =>
  list.map(([key, label, role, format]) => ({
    key, label, labelKey: 'bi.dim.column', role, format,
  })) as AggregateResult['columns']

/** Un concurrent par ligne : volume apparié, écart médian, complétude. */
const byCompetitor: AggregateResult = {
  columns: columns([
    ['site', 'Concurrent', 'dimension'],
    ['paired', 'Produits appariés', 'measure', 'int'],
    ['gap', 'Écart médian', 'measure', 'pct'],
    ['filled', 'Complétude', 'measure', 'pct'],
  ]),
  rows: SITES.map((site, i) => ({
    site,
    paired: Math.round(20529 / (i * 0.6 + 1)),
    gap: Math.round((i - 3.2) * 7.4 * 10) / 10,
    filled: 40 + ((i * 11) % 55),
  })),
}

/**
 * Une mesure, une dimension : la forme que la plupart des visuels attendent.
 *
 * ⚠⚠ Volontairement SÉPARÉ de `byCompetitor` : illustrer les barres avec ses trois mesures
 * (un volume, un pourcentage d'écart, un pourcentage de complétude) écraserait les deux
 * dernières sous la première — la documentation montrerait exactement le défaut qu'elle
 * apprend à éviter.
 */
const volumeByCompetitor: AggregateResult = {
  columns: columns([
    ['site', 'Concurrent', 'dimension'],
    ['paired', 'Produits appariés', 'measure', 'int'],
  ]),
  rows: byCompetitor.rows.map((r) => ({ site: r.site, paired: r.paired })),
}

/** Une mesure SIGNÉE : sans valeurs négatives, la coloration par signe n'a rien à montrer. */
const gapByCompetitor: AggregateResult = {
  columns: columns([
    ['site', 'Concurrent', 'dimension'],
    ['gap', 'Écart médian', 'measure', 'pct'],
  ]),
  rows: byCompetitor.rows.map((r) => ({ site: r.site, gap: r.gap })),
}

/** Une seule valeur : ce que montre un indicateur sans axe. */
const total: AggregateResult = {
  columns: columns([['paired', 'Fiches indexées', 'measure', 'int']]),
  rows: [{ paired: 534735 }],
}

/** Une valeur par mois : ce qui donne sa tendance à l'indicateur, et sa courbe à la ligne. */
const byMonth: AggregateResult = {
  columns: columns([
    ['month', 'Mois', 'dimension'],
    ['paired', 'Fiches indexées', 'measure', 'int'],
  ]),
  rows: ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']
    .map((month, i) => ({ month, paired: 380000 + i * 31000 + (i % 2) * 9000 })),
}

/** Deux dimensions croisées : ce qu'exigent le croisé, la carte de chaleur et l'empilement. */
const crossed: AggregateResult = {
  columns: columns([
    ['site', 'Concurrent', 'dimension'],
    ['position', 'Position', 'dimension'],
    ['n', 'Produits', 'measure', 'int'],
  ]),
  rows: SITES.slice(0, 5).flatMap((site, i) => [
    { site, position: 'Moins cher', n: 30 + i * 12 },
    { site, position: 'Aligné', n: 20 + (i % 3) * 6 },
    { site, position: 'Plus cher', n: 60 - i * 8 },
  ]),
}

/**
 * Deux dimensions ET deux mesures : la seule forme qu'un nuage COLORÉ par catégorie peut
 * prendre — il lui faut ses deux axes en plus de sa légende.
 */
const pricePosition: AggregateResult = {
  columns: columns([
    ['ref', 'Référence', 'dimension'],
    ['position', 'Position', 'dimension'],
    ['price', 'Mon prix HT', 'measure', 'eur'],
    ['gap', 'Écart concurrent', 'measure', 'pct'],
  ]),
  rows: Array.from({ length: 60 }, (_, i) => {
    const gap = Math.round((Math.sin(i * 1.7) * 34 - 6) * 10) / 10
    return {
      ref: `REF-${100 + i}`,
      position: gap < -4 ? 'Concurrent moins cher' : gap > 4 ? 'Je suis moins cher' : 'Aligné',
      price: Math.round(12 + Math.abs(Math.sin(i * 0.9)) * 320),
      gap,
    }
  }),
}

/** Étapes décroissantes : la forme qu'un entonnoir attend. */
const funnel: AggregateResult = {
  columns: columns([
    ['step', 'Étape', 'dimension'],
    ['n', 'Produits', 'measure', 'int'],
  ]),
  rows: [
    { step: 'Catalogue', n: 11581 }, { step: 'Indexés', n: 8420 },
    { step: 'Appariés', n: 4210 }, { step: 'Avec prix', n: 3180 },
  ],
}

const tile = (kind: TileKind, options?: Tile['options']): Tile => ({
  id: `doc-${kind}`, kind, title: 'Exemple', options,
  query: { source: 'watch.summary', measures: [{ id: 'x' }], dimensions: [], filters: [] },
})

const SHOTS: { id: string; kind: TileKind; result: AggregateResult
  options?: Tile['options']; height?: number }[] = [
  { id: 'kpi', kind: 'kpi', result: total, height: 150 },
  { id: 'kpi-trend', kind: 'kpi', result: byMonth, height: 180 },
  { id: 'gauge', kind: 'gauge', result: total, height: 190 },
  { id: 'bar', kind: 'bar', result: volumeByCompetitor },
  { id: 'bar-horizontal', kind: 'bar', result: volumeByCompetitor, options: { horizontal: true } },
  { id: 'bar-diverging', kind: 'bar', result: gapByCompetitor,
    options: { horizontal: true, diverging: true, referenceLine: 0 } },
  { id: 'bar-stacked', kind: 'bar', result: crossed, options: { stacked: true } },
  { id: 'bar-percent', kind: 'bar', result: crossed, options: { stackPercent: true } },
  { id: 'line', kind: 'line', result: byMonth, options: { referenceLine: 450000 } },
  { id: 'area', kind: 'area', result: byMonth },
  { id: 'pie', kind: 'pie', result: volumeByCompetitor },
  { id: 'doughnut', kind: 'doughnut', result: volumeByCompetitor },
  { id: 'table', kind: 'table', result: byCompetitor },
  { id: 'pivot', kind: 'pivot', result: crossed,
    options: { pivotColumn: 'position', showTotals: true } },
  { id: 'heatmap', kind: 'heatmap', result: crossed, options: { pivotColumn: 'position' } },
  { id: 'scatter', kind: 'scatter', result: byCompetitor },
  { id: 'scatter-legend', kind: 'scatter', result: pricePosition },
  { id: 'scatter3d', kind: 'scatter3d', result: byCompetitor, height: 340 },
  { id: 'funnel', kind: 'funnel', result: funnel },
]

const Frame = ({ id, height, children }: { id: string; height: number; children: ReactNode }) => (
  <div data-shot={id} className="rounded-lg border border-white/10 bg-surface p-3"
    style={{ width: 520, height }}>
    <div style={{ height: height - 24 }}>{children}</div>
  </div>
)

createRoot(document.getElementById('root')!).render(
  <div className="flex w-fit flex-col gap-4 bg-background p-4">
    {SHOTS.map((s) => (
      <Frame key={s.id} id={s.id} height={s.height ?? 250}>
        <TileVisual
          tile={tile(s.kind, s.options)} result={s.result} accent="#6366f1"
          tooltipKeys={new Set()} onPick={() => {}} onDrill={() => {}}
        />
      </Frame>
    ))}
  </div>,
)
