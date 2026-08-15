// Du résultat d'agrégation au nuage 3D. PUR : ni React, ni three.js, ni i18n.
//
// ⚠⚠ Les trois axes sont NORMALISÉS chacun dans [-1, 1]. Sans cela, un axe en euros
// (0 → 40 000) écraserait un axe en pourcentage (0 → 100) contre une arête de la boîte :
// le nuage deviendrait une ligne, et on croirait à une corrélation parfaite. Les valeurs
// BRUTES restent portées par chaque point pour l'info-bulle et les graduations.
//
// ⚠⚠ Une mesure CONSTANTE (un seul concurrent retenu, une complétude à 100 % partout) donne
// une étendue nulle : la normalisation y diviserait par zéro et poserait des NaN dans le
// tampon de géométrie — le nuage ENTIER disparaîtrait sans un mot. L'axe est alors centré.
import type { AggregateResult } from '../../engine/aggregate'

type ResultColumn = AggregateResult['columns'][number]

export interface Scatter3DPoint {
  /** Coordonnées de RENDU, dans [-1, 1] : ce que la scène three.js place. */
  nx: number
  ny: number
  nz: number
  /** Valeurs BRUTES, dans l'unité de leur mesure : ce que l'info-bulle affiche. */
  x: number
  y: number
  z: number
  /** Valeur de la dimension — l'identité du point (un concurrent, un produit). */
  label: string
  /**
   * Rang de la profondeur dans [0, 1] : commande la TEINTE du point.
   *
   * ⚠ La couleur redouble ici l'axe Z volontairement. La profondeur est le seul des trois
   * axes que l'œil ne mesure pas sur un écran plat ; un dégradé le rend lisible sans lui
   * inventer une information de plus.
   */
  depth: number
}

interface Scatter3DAxis {
  column: ResultColumn
  /** Bornes BRUTES de l'axe, pour graduer la boîte. */
  min: number
  max: number
}

export interface Scatter3DModel {
  points: Scatter3DPoint[]
  axes: { x: Scatter3DAxis; y: Scatter3DAxis; z: Scatter3DAxis }
  /**
   * Lignes ÉCARTÉES faute d'une des trois coordonnées.
   *
   * ⚠ Compté puis DIT à l'écran : un nuage silencieusement amputé de la moitié de ses
   * points se lit comme une donnée complète, et c'est sur lui qu'on décide.
   */
  dropped: number
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Le modèle du nuage, ou `null` quand la tuile n'a pas ses trois mesures — le composant
 * le DIT plutôt que de tracer un nuage plaqué sur un plan.
 */
export function buildScatter3D(result: AggregateResult): Scatter3DModel | null {
  const measures = result.columns.filter((c) => c.role === 'measure')
  // ⚠ Au-delà de trois, les suivantes sont IGNORÉES — même parti que le nuage 2D, qui ne
  // lit que ses deux premières mesures : la tuile rend ce qu'elle sait placer.
  if (measures.length < 3) return null
  const [cx, cy, cz] = measures
  const dim = result.columns.find((c) => c.role === 'dimension')

  const raw: { x: number; y: number; z: number; label: string }[] = []
  let dropped = 0
  for (const row of result.rows) {
    const x = row[cx.key]
    const y = row[cy.key]
    const z = row[cz.key]
    // ⚠ Un point sans l'une de ses coordonnées n'est pas un point à l'origine : il est
    // ÉCARTÉ. Le placer en (0, 0, 0) inventerait une observation.
    if (!isNum(x) || !isNum(y) || !isNum(z)) { dropped++; continue }
    raw.push({ x, y, z, label: dim ? String(row[dim.key] ?? '') : '' })
  }

  const span = (values: number[]) => {
    const min = Math.min(...values)
    const max = Math.max(...values)
    return { min, max }
  }
  const empty = { min: 0, max: 0 }
  const bx = raw.length ? span(raw.map((p) => p.x)) : empty
  const by = raw.length ? span(raw.map((p) => p.y)) : empty
  const bz = raw.length ? span(raw.map((p) => p.z)) : empty

  /** Étendue nulle = axe centré : sans ce repli, la division poserait des NaN partout. */
  const norm = (v: number, b: { min: number; max: number }) =>
    b.max === b.min ? 0 : ((v - b.min) / (b.max - b.min)) * 2 - 1

  return {
    points: raw.map((p) => ({
      ...p,
      nx: norm(p.x, bx),
      ny: norm(p.y, by),
      nz: norm(p.z, bz),
      depth: bz.max === bz.min ? 0.5 : (p.z - bz.min) / (bz.max - bz.min),
    })),
    axes: {
      x: { column: cx, ...bx },
      y: { column: cy, ...by },
      z: { column: cz, ...bz },
    },
    dropped,
  }
}
