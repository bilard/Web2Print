import { Group, type FabricObject } from 'fabric'

/**
 * Vrai si l'objet est le calque de fond verrouillé d'un projet image-to-svg
 * (marqueur `data.role`/`data.name` === 'image-bg-locked', posé à l'import par
 * `imageToSvg.ts` / `pdfToSvg.ts`).
 */
export const isBgLockedMarker = (obj: FabricObject): boolean => {
  const data = (obj as FabricObject & { data?: Record<string, unknown> }).data
  return data?.role === 'image-bg-locked' || data?.name === 'image-bg-locked'
}

/**
 * Verrouille un calque de fond et TOUTE sa descendance : ni sélectionnable, ni
 * déplaçable, ni redimensionnable, curseur neutre.
 *
 * ⚠ Ne touche PAS à `visible` : la visibilité relève de l'appelant — la décomposition
 * image→SVG cache l'image de fond une fois les tracés produits (template propre, sans
 * superposition), et la remontrer ici annulerait ce travail.
 */
export function lockBgRoot(root: FabricObject): void {
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
    }
  }
}
