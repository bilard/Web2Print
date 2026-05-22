import { useEffect } from 'react'
import { Canvas } from 'fabric'
import { useUIStore } from '@/stores/ui.store'
import { buildPrintMarks, removeAllPrintMarks } from '@/features/print/printMarks'
import { CANVAS_DPI, mmToCanvasPx } from '@/features/print/dimensions'

/**
 * Keep print marks in sync with store parameters.
 * Whenever bleed, crop, or safe area change, re-create marks.
 *
 * NB : la conversion mm → canvas px utilise `CANVAS_DPI` (72) — taille
 * physique des hirondelles/coupes constante quel que soit le format du
 * document importé. Le `dpi` du store ne concerne que l'export.
 */
export function usePrintMarksSync(fabricRef: React.MutableRefObject<Canvas | null>) {
  const {
    bleedMm, cropMarkLengthMm, cropMarkOffsetMm, safeAreaMm,
    canvasWidth, canvasHeight,
    showPrintMarks, showSafeArea, showRegistrationMarks,
    bleedStroke, bleedColor,
    cropStroke, cropColor,
    regRadiusMm, regStroke, regColor, regOffsetMm,
    safeStroke, safeColor, safeDash, safeGap,
  } = useUIStore()

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    // Remove old marks
    const old = removeAllPrintMarks(canvas.getObjects(), 'tagged')
    for (const o of old) canvas.remove(o)

    // Build new marks with current store values
    const marks = buildPrintMarks({
      canvasWidthPx: canvasWidth,
      canvasHeightPx: canvasHeight,
      pageLeftPx: 0,
      pageTopPx: 0,
      bleedPx: mmToCanvasPx(bleedMm),
      cropMarkLengthPx: mmToCanvasPx(cropMarkLengthMm),
      // Cap défensif : si une vieille valeur stockée dépasse 3 mm (anciennes
      // versions du slider allaient à 10 mm), on la borne ici pour éviter que
      // les marques apparaissent loin de la page.
      cropMarkOffsetPx: mmToCanvasPx(Math.min(cropMarkOffsetMm, 3)),
      safeAreaPx: mmToCanvasPx(safeAreaMm),
      dpi: CANVAS_DPI,
      showPrintMarks,
      showSafeArea,
      showRegistrationMarks,
      bleedStroke,
      bleedColor,
      cropStroke,
      cropColor,
      regRadiusMm,
      regStroke,
      regColor,
      regOffsetMm,
      safeStroke,
      safeColor,
      safeDash,
      safeGap,
    })

    // Add marks to canvas
    for (const m of marks) {
      canvas.add(m)
      m.setCoords()
      canvas.bringObjectToFront(m)
    }

    canvas.requestRenderAll()
  }, [
    bleedMm, cropMarkLengthMm, cropMarkOffsetMm, safeAreaMm,
    canvasWidth, canvasHeight,
    showPrintMarks, showSafeArea, showRegistrationMarks,
    bleedStroke, bleedColor,
    cropStroke, cropColor,
    regRadiusMm, regStroke, regColor, regOffsetMm,
    safeStroke, safeColor, safeDash, safeGap,
    // HMR : Vite remplace l'identité de buildPrintMarks à chaque hot-reload
    // du module printMarks.ts → l'effet se ré-exécute et redessine les marks
    // sans avoir à toggler ou recharger la page.
    buildPrintMarks,
  ])
}
