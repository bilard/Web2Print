import type { Canvas } from 'fabric'

/**
 * Référence au canvas Fabric actif, partagée entre hooks hors composant.
 *
 * Vit dans son propre module (import `fabric` en *type-only*, donc effacé au build)
 * pour qu'un consommateur léger comme `HelpTrigger` puisse lire le canvas SANS tirer
 * tout l'éditeur + Fabric + Three dans le bundle eager. `CanvasContainer` reste la
 * source qui l'alimente via `setGlobalFabricCanvas`.
 */
export let globalFabricCanvas: Canvas | null = null

export function setGlobalFabricCanvas(canvas: Canvas | null): void {
  globalFabricCanvas = canvas
}
