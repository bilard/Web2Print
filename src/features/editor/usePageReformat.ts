// src/features/editor/usePageReformat.ts
// Adaptation du contenu au format, EN PLACE (jamais de nouvelle page) :
// - resizeProportional : met le contenu à l'échelle (contain) pour qu'il SUIVE la
//   page quand on change de format. Déterministe, instantané, prévisible.
// - reflowWithAI : ré-agence le contenu par BLOCS (IA DeepSeek, descripteurs seuls)
//   pour mieux REMPLIR le format courant ; repli proportionnel garanti.
import { useCallback } from 'react'
import type { FabricObject } from 'fabric'
import { globalFabricCanvas } from './CanvasContainer'
import { FABRIC_SERIALIZED_PROPS } from './serializationProps'
import { syncToStore } from './useAddObject'
import { useUIStore } from '@/stores/ui.store'
import { scaleMergeGeometry } from '@/features/export/declineLayout'
import { fluidRelayoutToFormat } from '@/features/export/fluidRelayoutToFormat'
import { buildReformatTarget } from '@/features/export/reformatRule'
import type { DesignObject } from '@/features/export/relayoutMultiFormat'

type Canvas = NonNullable<typeof globalFabricCanvas>
type WithData = FabricObject & { data?: Record<string, unknown> }

/** Objets de design = hors grille, marques de coupe et fond de page. */
function designObjectsOf(canvas: Canvas): FabricObject[] {
  return canvas.getObjects().filter(
    (o) => !o.data?.isGrid && !o.data?.isPrintMark && !o.data?.isPageBg,
  )
}

/** Applique une géométrie (left/top/scaleX/scaleY + data fusion) à un objet vivant. */
function applyGeometry(o: FabricObject, g: { left?: number; top?: number; scaleX?: number; scaleY?: number; data?: unknown }, s: number): void {
  o.set({
    left: g.left ?? o.left ?? 0,
    top: g.top ?? o.top ?? 0,
    scaleX: g.scaleX ?? o.scaleX ?? 1,
    scaleY: g.scaleY ?? o.scaleY ?? 1,
  })
  const oo = o as WithData
  if (g.data !== undefined) oo.data = g.data as Record<string, unknown>
  else if (oo.data !== undefined) oo.data = scaleMergeGeometry(oo.data, s) as Record<string, unknown>
  o.setCoords()
}

export function usePageReformat() {
  /** Met le contenu à l'échelle (contain) de `old` vers `new`, EN PLACE.
   * Renvoie un diagnostic { count, scale } pour vérifier l'effet. */
  const resizeProportional = useCallback(
    (oldW: number, oldH: number, newW: number, newH: number): { count: number; scale: number } => {
      const canvas = globalFabricCanvas
      if (!canvas || oldW <= 0 || oldH <= 0) return { count: 0, scale: 0 }
      const s = Math.min(newW / oldW, newH / oldH)
      if (!(s > 0) || (Math.abs(s - 1) < 1e-6 && Math.round(oldW) === Math.round(newW) && Math.round(oldH) === Math.round(newH))) return { count: 0, scale: s }
      const offX = (newW - oldW * s) / 2
      const offY = (newH - oldH * s) / 2
      const objs = designObjectsOf(canvas)
      for (const o of objs) {
        applyGeometry(
          o,
          {
            left: (o.left ?? 0) * s + offX,
            top: (o.top ?? 0) * s + offY,
            scaleX: (o.scaleX ?? 1) * s,
            scaleY: (o.scaleY ?? 1) * s,
          },
          s,
        )
      }
      canvas.requestRenderAll()
      syncToStore(canvas)
      return { count: objs.length, scale: s }
    },
    [],
  )

  /** Ré-agence le contenu par blocs (IA) pour le format COURANT, EN PLACE.
   * Renvoie `ok` (false si rien à faire) et `usedFallback` (IA indisponible). */
  const reflowWithAI = useCallback(async (): Promise<{ ok: boolean; usedFallback: boolean }> => {
    const canvas = globalFabricCanvas
    if (!canvas) return { ok: false, usedFallback: false }
    const live = designObjectsOf(canvas)
    if (live.length === 0) return { ok: false, usedFallback: false }

    const { canvasWidth, canvasHeight } = useUIStore.getState()
    const serialized = live.map((o) => o.toObject(FABRIC_SERIALIZED_PROPS) as DesignObject)
    const target = buildReformatTarget(canvasWidth, canvasHeight)
    const out = await fluidRelayoutToFormat({
      objects: serialized,
      srcW: canvasWidth,
      srcH: canvasHeight,
      target,
    })
    out.objects.forEach((to, i) => {
      const o = live[i]
      if (o) applyGeometry(o, to, 1)
    })
    canvas.discardActiveObject()
    canvas.requestRenderAll()
    syncToStore(canvas)
    return { ok: true, usedFallback: out.usedFallback }
  }, [])

  return { resizeProportional, reflowWithAI }
}
