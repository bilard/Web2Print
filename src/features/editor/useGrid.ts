import { useEffect } from 'react'
import { Canvas, Line, StaticCanvas } from 'fabric'
import { useUIStore } from '@/stores/ui.store'

const GRID_SIZE = 20
const GRID_COLOR = 'rgba(255,255,255,0.07)'

export function useGrid(fabricRef: React.RefObject<Canvas | null>) {
  const { gridVisible, canvasWidth, canvasHeight } = useUIStore()

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    // Remove existing grid lines
    const existing = canvas.getObjects().filter((o) => (o as any).data?.isGrid)
    existing.forEach((o) => canvas.remove(o))

    if (gridVisible) {
      const lines: Line[] = []

      for (let x = 0; x <= canvasWidth; x += GRID_SIZE) {
        const line = new Line([x, 0, x, canvasHeight], {
          stroke: GRID_COLOR,
          strokeWidth: 1,
          selectable: false,
          evented: false,
          excludeFromExport: true,
          data: { isGrid: true },
        })
        lines.push(line)
      }

      for (let y = 0; y <= canvasHeight; y += GRID_SIZE) {
        const line = new Line([0, y, canvasWidth, y], {
          stroke: GRID_COLOR,
          strokeWidth: 1,
          selectable: false,
          evented: false,
          excludeFromExport: true,
          data: { isGrid: true },
        })
        lines.push(line)
      }

      lines.forEach((l) => canvas.add(l))
      lines.forEach((l) => canvas.sendObjectToBack(l))
    }

    canvas.requestRenderAll()
  }, [gridVisible, canvasWidth, canvasHeight, fabricRef.current]) // eslint-disable-line react-hooks/exhaustive-deps
}
