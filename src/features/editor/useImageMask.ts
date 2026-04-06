import { useEffect } from 'react'
import { Canvas, FabricImage, Rect } from 'fabric'

/**
 * Attach a default clipPath to a FabricImage if it doesn't have one.
 * Centered, object-space (Fabric v6 convention).
 */
export function ensureImageClipPath(img: FabricImage): void {
  if ((img as any).clipPath) return
  const w = (img as any).width ?? 0
  const h = (img as any).height ?? 0
  if (w <= 0 || h <= 0) return
  ;(img as any).clipPath = new Rect({
    left: -w / 2,
    top: -h / 2,
    width: w,
    height: h,
    absolutePositioned: false,
  })
}

export function useImageMask(fabricRef: React.RefObject<Canvas | null>) {
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    // Auto-attach clipPath to any newly added image
    const onAdded = (e: { target?: any }) => {
      const t = e.target
      if (t instanceof FabricImage) ensureImageClipPath(t)
    }
    canvas.on('object:added', onAdded)

    return () => {
      canvas.off('object:added', onAdded)
    }
  }, [fabricRef.current]) // eslint-disable-line react-hooks/exhaustive-deps
}
