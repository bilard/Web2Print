// ⚠⚠ Un graphe dessiné mais MORT au clic.
//
// `requestAnimationFrame` ne bat pas dans un onglet masqué. Chart.js anime ses barres de
// zéro vers leur valeur : sans frames, l'animation d'entrée ne se joue JAMAIS et chaque
// élément reste à hauteur nulle. Le graphe finit pourtant par s'afficher — mais ses zones
// cliquables font zéro pixel de haut, et plus un seul clic ne filtre la page. Relevé en
// prod sur le module BI : les 24 barres à `base - y === 0`, filtrage croisé muet.
//
// Au retour de l'onglet, on repose l'état SANS animation (`update('none')`), ce qui rend
// aux éléments leur géométrie réelle. Un seul écouteur pour toute l'application : le
// registre de chart.js est un singleton, et tous ses graphes souffrent du même mal.
import { Chart } from 'chart.js'

let installed = false

/** Pose l'écouteur, une fois. Appelée au chargement des modules qui rendent un graphe. */
export function installChartVisibilityRepair(): void {
  if (installed || typeof document === 'undefined') return
  installed = true
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return
    repairCharts()
  })
}

/** Repose la géométrie de tous les graphes vivants. Exportée pour le test. */
export function repairCharts(): void {
  // ⚠ `Chart.instances` est le registre interne : on le lit sans supposer sa forme, un
  // graphe détruit entre-temps ne doit pas faire tomber la réparation des autres.
  for (const chart of Object.values(Chart.instances ?? {})) {
    try { chart.update('none') } catch { /* graphe démonté entre-temps : sans importance */ }
  }
}
