// La ligne de REPÈRE d'un graphe : un objectif, une base 100, un zéro.
//
// ⚠⚠ Écrite à la main plutôt qu'avec `chartjs-plugin-annotation` : le plugin pèse plus que
// ce fichier pour une seule ligne droite, et il faudrait le charger sur TOUTES les tuiles.
//
// ⚠⚠ À ne pas confondre avec le seuil d'ALERTE : celui-ci sonne quand il est franchi, cette
// ligne se dessine et ne déclenche rien. Deux réglages, deux intentions.
import type { Chart, Plugin } from 'chart.js'

/** Repère lu sur la tuile, posé dans les options du graphe sous cette clé. */
interface ReferenceLineSpec {
  value: number
  /** Valeur formatée dans l'unité de la mesure — l'étiquette collée à la ligne. */
  label: string
  /** Couleur de la ligne et de son étiquette, déjà résolue pour le thème. */
  color: string
}

/** Options du graphe augmentées du repère : chart.js transporte les clés inconnues telles
 *  quelles jusqu'au plugin, c'est le canal prévu pour ça. */
interface WithReference {
  options?: { referenceLine?: ReferenceLineSpec }
}

/**
 * Trace la ligne APRÈS les jeux de données : elle doit rester visible par-dessus les barres,
 * sinon elle disparaît sous la première série qui la croise.
 *
 * ⚠ L'orientation suit `indexAxis` : sur des barres couchées, l'axe des VALEURS est `x` — le
 * repère y est une verticale. Une horizontale y traverserait les catégories et ne
 * repérerait rien.
 */
export const referenceLinePlugin: Plugin = {
  id: 'biReferenceLine',
  afterDatasetsDraw(chart: Chart) {
    const spec = (chart.config as unknown as WithReference).options?.referenceLine
    if (!spec) return
    const horizontal = chart.options.indexAxis === 'y'
    const scale = horizontal ? chart.scales.x : chart.scales.y
    if (!scale) return
    const at = scale.getPixelForValue(spec.value)
    const { left, right, top, bottom } = chart.chartArea
    // ⚠ Hors du cadre, on ne trace RIEN : chart.js dessinerait sinon la ligne collée au bord,
    // où elle se lirait comme une valeur atteinte alors qu'elle est hors échelle.
    if (horizontal ? at < left || at > right : at < top || at > bottom) return

    const { ctx } = chart
    ctx.save()
    ctx.beginPath()
    ctx.setLineDash([5, 4])
    ctx.lineWidth = 1.5
    ctx.strokeStyle = spec.color
    if (horizontal) {
      ctx.moveTo(at, top)
      ctx.lineTo(at, bottom)
    } else {
      ctx.moveTo(left, at)
      ctx.lineTo(right, at)
    }
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = spec.color
    ctx.font = '600 10px system-ui, sans-serif'
    ctx.textBaseline = 'bottom'
    ctx.textAlign = horizontal ? 'center' : 'right'
    // L'étiquette porte la VALEUR : une ligne sans son chiffre demande de la mesurer à l'œil.
    ctx.fillText(spec.label, horizontal ? at : right, horizontal ? top + 12 : at - 3)
    ctx.restore()
  },
}
