// src/features/export/declineLayout.ts
// Déclinaisons multi-format v2 — re-projection géométrique du design vers des
// pages éditables aux ratios cibles. Contrairement au « Pack social » (v1) qui
// letterboxe un PNG figé, on transforme les objets Fabric eux-mêmes (scale
// « contain » + centrage) pour produire de VRAIES pages éditables : l'utilisateur
// ajuste ensuite chaque déclinaison à la main.
//
// Pur, sans dépendance Fabric ni rôle sémantique (les docs ordinaires n'en
// portent pas) : transformation affine uniforme autour de l'origine page.

export interface DeclineTarget {
  id: string
  label: string
  w: number
  h: number
}

/** Formats cibles par défaut (alignés sur le Pack social). */
export const DECLINE_TARGETS: readonly DeclineTarget[] = [
  { id: 'post-carre', label: 'Post carré', w: 1080, h: 1080 },
  { id: 'story', label: 'Story / Reel', w: 1080, h: 1920 },
  { id: 'post-paysage', label: 'Post paysage', w: 1920, h: 1080 },
  { id: 'banniere', label: 'Bannière', w: 1500, h: 500 },
] as const

/** Sous-ensemble des champs d'objet Fabric sérialisé que l'on transforme. */
interface ProjectableObject {
  left?: number
  top?: number
  scaleX?: number
  scaleY?: number
  data?: unknown
  [key: string]: unknown
}

/**
 * Réconcilie les MÉTADONNÉES de fusion (`data.*`) avec une transformation de
 * facteur `s`, pour que l'objet GARDE sa nouvelle position/taille une fois
 * retravaillé (sinon le système de fusion réimpose la géométrie d'origine).
 * - Champs d'ANCRAGE positionnels (`mergeBaseTop`/`mergeBaseHeight`) → SUPPRIMÉS :
 *   le merge les re-capture depuis la nouvelle géométrie (cf. compactHiddenMergeFields).
 * - Champs d'INTENTION (taille de zone `fitZone`, `autoFitWidth`) → mis à l'échelle.
 * Renvoie un NOUVEL objet data (ou la valeur d'origine si rien à faire).
 */
export function scaleMergeGeometry(data: unknown, s: number): unknown {
  if (!data || typeof data !== 'object') return data
  const d = data as Record<string, unknown>
  const fz = d.fitZone
  const hasFit = !!fz && typeof fz === 'object'
  const hasAuto = typeof d.autoFitWidth === 'number'
  const hasBase = d.mergeBaseTop !== undefined || d.mergeBaseHeight !== undefined
  if (!hasFit && !hasAuto && !hasBase) return data
  const next: Record<string, unknown> = { ...d }
  delete next.mergeBaseTop
  delete next.mergeBaseHeight
  if (hasFit) {
    const z = fz as { width?: number; height?: number; maxLines?: number }
    next.fitZone = { ...z, width: (z.width ?? 0) * s, height: (z.height ?? 0) * s }
  }
  if (hasAuto) next.autoFitWidth = (d.autoFitWidth as number) * s
  return next
}

/**
 * Re-projette des objets sérialisés depuis un canvas source `srcW×srcH` vers un
 * cadre cible `dstW×dstH` par un scale UNIFORME + centrage — la composition est
 * préservée (un seul facteur appliqué à TOUS les objets). La transformation
 * s'applique autour de l'origine (0,0 = coin haut-gauche de la page), donc
 * indépendante de originX/originY des objets.
 *
 * - `mode='contain'` (défaut) : `s = min(...)` → tout reste visible, marges possibles.
 * - `mode='cover'` : `s = max(...)` → le design REMPLIT le format cible, le
 *   trop-plein déborde (rogné par la page). Sert au « Reformater » en proportion.
 *
 * Renvoie de NOUVEAUX objets (les sources ne sont pas mutées).
 */
export function projectObjectsToFormat<T extends ProjectableObject>(
  objects: readonly T[],
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  mode: 'contain' | 'cover' = 'contain',
): T[] {
  if (srcW <= 0 || srcH <= 0) return objects.map((o) => ({ ...o }))
  const s = mode === 'cover'
    ? Math.max(dstW / srcW, dstH / srcH)
    : Math.min(dstW / srcW, dstH / srcH)
  const offsetX = (dstW - srcW * s) / 2
  const offsetY = (dstH - srcH * s) / 2
  return objects.map((o) => {
    const next: T = {
      ...o,
      left: (o.left ?? 0) * s + offsetX,
      top: (o.top ?? 0) * s + offsetY,
      scaleX: (o.scaleX ?? 1) * s,
      scaleY: (o.scaleY ?? 1) * s,
    }
    if (o.data !== undefined) next.data = scaleMergeGeometry(o.data, s)
    return next
  })
}
