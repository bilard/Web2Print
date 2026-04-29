import { useEffect } from 'react'
import { Canvas } from 'fabric'
import { useUIStore } from '@/stores/ui.store'
import { buildPrintMarks, removeAllPrintMarks } from '@/features/print/printMarks'
import { mmToPx } from '@/features/print/dimensions'

/**
 * Keep print marks in sync with store parameters.
 * Whenever dpi, bleed, crop, or safe area change, re-create marks.
 */
export function usePrintMarksSync(fabricRef: React.MutableRefObject<Canvas | null>) {
  const { dpi, bleedMm, cropMarkLengthMm, cropMarkOffsetMm, safeAreaMm, canvasWidth, canvasHeight } = useUIStore()

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
      bleedPx: mmToPx(bleedMm, dpi),
      cropMarkLengthPx: mmToPx(cropMarkLengthMm, dpi),
      cropMarkOffsetPx: mmToPx(cropMarkOffsetMm, dpi),
      safeAreaPx: mmToPx(safeAreaMm, dpi),
      dpi: dpi,
      showPrintMarks: true,
      showSafeArea: true,
      showRegistrationMarks: true,
    })

    // Add marks to canvas
    for (const m of marks) {
      canvas.add(m)
      m.setCoords()
      canvas.bringObjectToFront(m)
    }

    canvas.requestRenderAll()
  }, [dpi, bleedMm, cropMarkLengthMm, cropMarkOffsetMm, safeAreaMm, canvasWidth, canvasHeight])
}
