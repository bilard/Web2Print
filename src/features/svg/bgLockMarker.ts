import type { FabricObject } from 'fabric'

/**
 * Vrai si l'objet est le calque de fond verrouillé d'un projet image-to-svg
 * (marqueur `data.role`/`data.name` === 'image-bg-locked', posé à l'import par
 * `imageToSvg.ts` / `pdfToSvg.ts`).
 */
export const isBgLockedMarker = (obj: FabricObject): boolean => {
  const data = (obj as FabricObject & { data?: Record<string, unknown> }).data
  return data?.role === 'image-bg-locked' || data?.name === 'image-bg-locked'
}
