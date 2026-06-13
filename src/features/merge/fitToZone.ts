// src/features/merge/fitToZone.ts
// « Réduire pour tenir dans la zone » (auto-fit v2) — cœur pur du calcul d'échelle
// de police. L'application réelle (mesure Fabric, styles par caractère) vit dans
// useDataMerge ; ici uniquement la logique géométrique testable.

/** Police minimale après réduction (en px). En-deçà, illisible. */
export const MIN_FIT_FONT = 6

/** Borne la taille de police au plancher lisible. */
export function clampFitFont(size: number): number {
  return Math.max(MIN_FIT_FONT, size)
}

/**
 * Échelle (≤ 1) à appliquer pour qu'un texte d'une seule ligne de largeur
 * `contentWidth` tienne dans `zoneWidth`. La largeur d'une ligne varie
 * linéairement avec la taille de police → une seule division suffit.
 * Renvoie 1 (pas de réduction) si déjà dans la zone ou si entrées invalides.
 */
export function fitScaleForWidth(contentWidth: number, zoneWidth: number): number {
  if (contentWidth <= 0 || zoneWidth <= 0) return 1
  return Math.min(1, zoneWidth / contentWidth)
}

/** Facteur de réduction d'un pas pour la recherche itérative (cas wrap/hauteur). */
export const FIT_SHRINK_STEP = 0.94
