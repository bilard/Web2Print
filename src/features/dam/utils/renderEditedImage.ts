import type { DamCropMask, DamVariantEdits } from '../types'

export function buildCssFilter(f: DamVariantEdits['filters']): string {
  const parts: string[] = []
  if (f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`)
  if (f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`)
  if (f.saturation !== 100) parts.push(`saturate(${f.saturation}%)`)
  if (f.hue !== 0) parts.push(`hue-rotate(${f.hue}deg)`)
  return parts.length > 0 ? parts.join(' ') : 'none'
}

export const DEFAULT_MASK: DamCropMask = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  enabled: false,
}

export function isMaskIdentity(mask: DamCropMask): boolean {
  return (
    !mask.enabled ||
    (mask.x === 0 && mask.y === 0 && mask.width === 1 && mask.height === 1)
  )
}

/**
 * Converts a normalized mask (0-1) to pixel coordinates in the source image.
 * If the mask is disabled or identity, returns the full image area.
 */
export function getMaskPixels(imgW: number, imgH: number, mask: DamCropMask) {
  if (isMaskIdentity(mask)) {
    return { cropX: 0, cropY: 0, cropW: imgW, cropH: imgH }
  }
  const cropX = Math.max(0, Math.round(mask.x * imgW))
  const cropY = Math.max(0, Math.round(mask.y * imgH))
  const cropW = Math.max(1, Math.round(mask.width * imgW))
  const cropH = Math.max(1, Math.round(mask.height * imgH))
  return {
    cropX,
    cropY,
    cropW: Math.min(cropW, imgW - cropX),
    cropH: Math.min(cropH, imgH - cropY),
  }
}

/**
 * Returns a CSS clip-path inset() string for a mask, to use on the image element.
 * Accounts for the image being visually flipped — the insets must be mirrored so
 * the visible crop still matches the normalized mask in image-space.
 */
export function buildMaskClipPath(mask: DamCropMask, flipH: boolean, flipV: boolean): string | undefined {
  if (isMaskIdentity(mask)) return undefined
  let top = mask.y * 100
  let left = mask.x * 100
  let right = (1 - mask.x - mask.width) * 100
  let bottom = (1 - mask.y - mask.height) * 100
  if (flipH) {
    const tmp = left
    left = right
    right = tmp
  }
  if (flipV) {
    const tmp = top
    top = bottom
    bottom = tmp
  }
  return `inset(${top}% ${right}% ${bottom}% ${left}%)`
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

interface RenderOptions {
  format?: 'image/png' | 'image/jpeg' | 'image/webp'
  quality?: number
  scale?: number
  maxDimension?: number
}

/**
 * Renders an image with the given edits applied (mask crop, rotation, flip, filters).
 * Returns a Blob of the rendered result.
 */
export async function renderEditedImage(
  imageUrl: string,
  edits: DamVariantEdits,
  options: RenderOptions = {}
): Promise<{ blob: Blob; width: number; height: number }> {
  const { format = 'image/png', quality = 0.92, scale = 1, maxDimension } = options

  const img = await loadImage(imageUrl)

  // 1. Resolve mask region in pixel space
  const { cropX, cropY, cropW, cropH } = getMaskPixels(
    img.naturalWidth,
    img.naturalHeight,
    edits.mask
  )

  // 2. Compute output dims with optional max dimension clamp
  let outW = cropW * scale
  let outH = cropH * scale
  if (maxDimension) {
    const max = Math.max(outW, outH)
    if (max > maxDimension) {
      const ratio = maxDimension / max
      outW = Math.round(outW * ratio)
      outH = Math.round(outH * ratio)
    }
  }

  // Rotation swaps canvas dimensions for 90/270
  const rotated = edits.rotation === 90 || edits.rotation === 270
  const canvasW = rotated ? outH : outW
  const canvasH = rotated ? outW : outH

  const canvas = document.createElement('canvas')
  canvas.width = canvasW
  canvas.height = canvasH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas context unavailable')

  ctx.filter = buildCssFilter(edits.filters)
  ctx.save()
  ctx.translate(canvasW / 2, canvasH / 2)
  ctx.rotate((edits.rotation * Math.PI) / 180)
  ctx.scale(edits.flipH ? -1 : 1, edits.flipV ? -1 : 1)

  // Draw the masked region, stretched to outW x outH, centered
  ctx.drawImage(
    img,
    cropX, cropY, cropW, cropH,
    -outW / 2, -outH / 2, outW, outH
  )
  ctx.restore()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, format, format === 'image/png' ? undefined : quality)
  )
  if (!blob) throw new Error('Failed to encode image')

  return { blob, width: canvasW, height: canvasH }
}
