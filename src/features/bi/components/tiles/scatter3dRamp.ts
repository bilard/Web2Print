// Les rampes de couleur du nuage 3D. PUR : ni three.js, ni React.
//
// ⚠⚠ Une rampe SÉQUENTIELLE, jamais un arc-en-ciel décoratif : la teinte dit la position sur
// l'axe de profondeur, celui que l'œil ne mesure pas sur un écran plat. Les crans viennent de
// `viridis`, la rampe de référence en visualisation scientifique — perceptuellement uniforme
// (un même écart de couleur vaut un même écart de valeur) et lisible en vision daltonienne,
// ce qu'aucun dégradé choisi à l'œil ne garantit.
//
// ⚠ Deux jeux CHOISIS, jamais l'inversion automatique l'un de l'autre : sur fond clair, le
// haut de rampe jaune de `viridis` s'efface — la version claire s'arrête au vert et descend
// vers le violet foncé, du clair vers le sombre comme le veut une rampe sur fond blanc.

/**
 * Ordre de teintes de `viridis`, mais ÉCLAIRCI par le bas : pour les fonds sombres.
 *
 * ⚠⚠ Le `viridis` d'origine descend jusqu'au violet profond (#440154), et vu à l'écran ce
 * cran ne se DISTINGUAIT PAS du fond de la tuile : 1,3:1 de contraste, là où une marque
 * graphique en demande 3:1. Or une distribution en longue traîne — la règle sur ces données —
 * loge la majorité des points dans le bas de la rampe : le nuage disparaissait presque
 * entièrement. Le premier cran est donc relevé jusqu'à un violet lumineux, et l'ORDRE des
 * teintes (violet → bleu → vert → jaune) fait seul le travail séquentiel.
 */
export const RAMP_DARK = [
  '#8f7ae8', '#6a8fe0', '#3aa8b8', '#22a884', '#7ad151', '#fde725',
] as const

/**
 * `viridis` retourné et écourté, du vert au violet : pour les fonds clairs.
 *
 * ⚠ Symétrique du réglage sombre : le premier cran est ASSOMBRI (#159a63 et non le #35b779
 * d'origine), qui ne tenait que 2,6:1 contre un fond quasi blanc.
 */
export const RAMP_LIGHT = [
  '#159a63', '#22a884', '#2a788e', '#414487', '#440a63', '#2d0640',
] as const

/** Composantes 0-255 d'un `#rrggbb`. */
function parse(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Couleur d'une position `t` ∈ [0, 1] sur la rampe, en `#rrggbb`.
 *
 * ⚠ `t` est BORNÉ plutôt que rejeté : un arrondi qui donnerait 1.0000001 ne doit pas rendre
 * `undefined`, ce qui peindrait un point en noir au milieu du nuage.
 */
export function rampAt(ramp: readonly string[], t: number): string {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0))
  const scaled = clamped * (ramp.length - 1)
  const i = Math.min(ramp.length - 2, Math.floor(scaled))
  const f = scaled - i
  const a = parse(ramp[i])
  const b = parse(ramp[i + 1])
  const mix = a.map((v, k) => Math.round(v + (b[k] - v) * f))
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** La rampe en dégradé CSS, pour la légende sous le visuel. */
export const rampCss = (ramp: readonly string[]): string =>
  `linear-gradient(90deg, ${ramp.join(', ')})`
