/**
 * Hook léger qui verrouille automatiquement le calque image-bg-locked d'un
 * projet image-to-svg dès qu'il est détecté dans le canvas.
 *
 * - `selectable: false, evented: false` : l'image laisse passer les clics aux
 *   overlays que l'utilisateur ajoute (Textbox, Rect, Shapes…).
 * - `lockMovement/Scaling/Rotation` : empêche tout déplacement accidentel.
 * - `hasControls: false` : pas de poignées visibles.
 *
 * Propage récursivement aux enfants si le calque est un Group (cas habituel
 * du parsing SVG de `imageToSvg.ts`).
 *
 * Remplace `useImageToSvgDecompose` qui hébergeait la décomposition automatique
 * Vision — celle-ci a été retirée car trop imprécise en pratique. L'utilisateur
 * ajoute manuellement ses overlays via les outils standard (T, Rect, Circle…).
 */

import { useEffect } from 'react'
import { FabricImage, Group } from 'fabric'
import type { FabricObject } from 'fabric'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { useEditorStore } from '@/stores/editor.store'

const isBgLockedMarker = (obj: FabricObject): boolean => {
  const data = (obj as FabricObject & { data?: Record<string, unknown> }).data
  return data?.role === 'image-bg-locked' || data?.name === 'image-bg-locked'
}

function lockBgRoot(root: FabricObject): void {
  root.set({
    selectable: false,
    evented: false,
    lockMovementX: true,
    lockMovementY: true,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
    hasControls: false,
    hoverCursor: 'default',
  })
  if (root instanceof Group) {
    for (const child of (root as unknown as { _objects?: FabricObject[] })._objects ?? []) {
      child.set({ selectable: false, evented: false, hasControls: false, hoverCursor: 'default' })
      if (child instanceof Group) lockBgRoot(child)
      else if (child instanceof FabricImage) {
        // explicit, redundant — sécurité pour Fabric findControl avec enfants Image
        child.set({ hasControls: false })
      }
    }
  }
}

export function useLockBgImage(): void {
  const objectsHash = useEditorStore((s) => s.canvasObjects.length)

  useEffect(() => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const root = canvas.getObjects().find(isBgLockedMarker)
    if (root) {
      lockBgRoot(root)
      canvas.requestRenderAll()
    }
  }, [objectsHash])
}
