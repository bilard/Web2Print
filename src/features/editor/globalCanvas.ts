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
  // Exposé sur window pour l'inspection en console (debug prod sans source maps).
  ;(window as Window & { __fabricCanvas?: Canvas | null }).__fabricCanvas = canvas
}

/**
 * Commandes de l'éditeur exposées hors composant, pour les mêmes raisons que le
 * canvas : un panneau ou un hook d'export doit pouvoir déclencher un snapshot
 * sans importer `CanvasContainer` — donc sans tirer Fabric et Three.
 *
 * `CanvasContainer` en est la seule source : il les branche au montage et les
 * remet à `null` au démontage, via les setters ci-dessous.
 */
export let globalUndo: (() => void) | null = null
export let globalRedo: (() => void) | null = null
export let globalSnapshot: (() => void) | null = null
export let globalFitCanvas: (() => void) | null = null

export function setEditorCommands(
  commands: { undo: (() => void) | null; redo: (() => void) | null; snapshot: (() => void) | null },
): void {
  globalUndo = commands.undo
  globalRedo = commands.redo
  globalSnapshot = commands.snapshot
}

export function setGlobalFitCanvas(fit: (() => void) | null): void {
  globalFitCanvas = fit
}

/**
 * Attend que le canvas Fabric global existe, dans la limite d'un délai.
 *
 * Les imports (IDML, SVG) peuvent être déclenchés avant que l'éditeur ait monté son
 * canvas — au chargement d'un projet, ou depuis un panneau ouvert d'emblée. Sans cette
 * attente, l'import échouait silencieusement sur un canvas null. Résout `null` au
 * dépassement du délai : à l'appelant de le signaler, pas à ce helper de trancher.
 */
export function waitForCanvas(timeoutMs: number): Promise<typeof globalFabricCanvas> {
  return new Promise((resolve) => {
    if (globalFabricCanvas) return resolve(globalFabricCanvas)
    const start = Date.now()
    const interval = setInterval(() => {
      if (globalFabricCanvas) {
        clearInterval(interval)
        resolve(globalFabricCanvas)
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval)
        resolve(null)
      }
    }, 100)
  })
}
