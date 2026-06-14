// src/features/export/reformatRule.ts
// Règle PURE décidant si un changement de format doit lancer le re-layout IA
// (nouvelle page adaptée) plutôt qu'une simple retaille en place, et construction
// de la cible de format. Aucune dépendance React/Fabric : testable isolément.
import type { DeclineTarget } from './declineLayout'
import { canvasPxToMm } from '@/features/print/dimensions'

export interface ReformatDecisionInput {
  /** Nombre d'objets de design (hors grille / marques / fond de page). */
  designObjectCount: number
  srcW: number
  srcH: number
  dstW: number
  dstH: number
}

/** Vrai si l'auto-reformat IA doit se déclencher : il faut du contenu à adapter
 * ET un changement de dimensions réel (comparé sur valeurs arrondies au pt). */
export function shouldReformat({ designObjectCount, srcW, srcH, dstW, dstH }: ReformatDecisionInput): boolean {
  if (designObjectCount < 1) return false
  const sameW = Math.round(srcW) === Math.round(dstW)
  const sameH = Math.round(srcH) === Math.round(dstH)
  if (sameW && sameH) return false
  return true
}

/** Construit la cible de re-layout. `presetLabel` fourni → on l'utilise comme
 * libellé ; sinon libellé en mm (cohérent avec l'affichage du panneau PAGE).
 * `id` déterministe pour permettre l'idempotence (régénérer la même page adaptée). */
export function buildReformatTarget(wPt: number, hPt: number, presetLabel?: string): DeclineTarget {
  const w = Math.round(wPt)
  const h = Math.round(hPt)
  const label = presetLabel ?? `${Math.round(canvasPxToMm(w))} × ${Math.round(canvasPxToMm(h))} mm`
  return { id: `reformat-${w}x${h}`, label, w, h }
}
