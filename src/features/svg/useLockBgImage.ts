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
import { globalFabricCanvas } from '@/features/editor/globalCanvas'
import { useEditorStore } from '@/stores/editor.store'
import { isBgLockedMarker, lockBgRoot } from './bgLockMarker'

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
