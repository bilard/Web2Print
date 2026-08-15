// La couleur du module. PUR — aucune dépendance à React ni au thème.
//
// ⚠⚠ Les dix teintes tiennent sur fond sombre ET sur fond clair : le module bascule de
// thème, et une palette réglée sur un seul fond rendrait la moitié des séries illisibles.
//
// ⚠ Une couleur n'est jamais tirée au hasard : elle vient soit du RANG de la série, soit
// d'une empreinte STABLE de l'identifiant de la tuile. Une couleur qui changerait d'un rendu
// à l'autre ferait croire que la donnée a changé.

/** Palette de séries — ordre choisi pour que deux voisines restent distinguables. */
export const PALETTE = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4',
  '#a855f7', '#ec4899', '#84cc16', '#f97316', '#14b8a6',
]

/** Teintes d'accompagnement, alignées sur la palette (fonds, liserés, halos). */
export const paletteAt = (i: number): string => PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length]

/**
 * Couleur STABLE d'une tuile, tirée de son identifiant.
 *
 * ⚠ Empreinte déterministe (et non l'ordre d'affichage) : déplacer une tuile dans la grille
 * ne doit pas la faire changer de couleur — on retrouve « la tuile verte » d'un coup d'œil.
 */
export function accentOf(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return paletteAt(h)
}
