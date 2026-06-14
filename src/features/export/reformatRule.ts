// src/features/export/reformatRule.ts
// Construit la cible de format (DeclineTarget) pour le re-layout fluide. PUR
// (aucune dépendance React/Fabric) : testable isolément.
import type { DeclineTarget } from './declineLayout'
import { canvasPxToMm } from '@/features/print/dimensions'

/** Construit la cible de re-layout. `presetLabel` fourni → on l'utilise comme
 * libellé ; sinon libellé en mm (cohérent avec l'affichage du panneau PAGE).
 * `id` déterministe `reformat-WxH`. */
export function buildReformatTarget(wPt: number, hPt: number, presetLabel?: string): DeclineTarget {
  const w = Math.round(wPt)
  const h = Math.round(hPt)
  const label = presetLabel ?? `${Math.round(canvasPxToMm(w))} × ${Math.round(canvasPxToMm(h))} mm`
  return { id: `reformat-${w}x${h}`, label, w, h }
}
