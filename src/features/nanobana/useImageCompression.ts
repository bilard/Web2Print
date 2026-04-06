import { useCallback } from 'react'
import type { CompressionOptions, CompressionResult } from './types'

const DEFAULT_OPTIONS: CompressionOptions = {
  maxWidth: 2048,
  maxHeight: 2048,
  quality: 0.85,
  format: 'image/jpeg',
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

async function compressImage(
  file: File,
  options: CompressionOptions = DEFAULT_OPTIONS,
): Promise<CompressionResult> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    let { width, height } = img

    // Scale down if exceeds max dimensions
    const ratio = Math.min(
      options.maxWidth / width,
      options.maxHeight / height,
      1, // Never scale up
    )
    width = Math.round(width * ratio)
    height = Math.round(height * ratio)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, width, height)

    // PNG stays PNG to preserve transparency
    const isPng = file.type === 'image/png'
    const format = isPng ? 'image/png' : options.format

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Compression failed'))),
        format,
        isPng ? undefined : options.quality,
      )
    })

    return {
      blob,
      width,
      height,
      originalSize: file.size,
      compressedSize: blob.size,
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Generate a small thumbnail blob */
async function createThumbnail(file: File, maxSize = 200): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1)
    const w = Math.round(img.width * ratio)
    const h = Math.round(img.height * ratio)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, w, h)

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Thumbnail failed'))),
        'image/jpeg',
        0.7,
      )
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function useImageCompression() {
  const compress = useCallback(
    (file: File, options?: Partial<CompressionOptions>) =>
      compressImage(file, { ...DEFAULT_OPTIONS, ...options }),
    [],
  )

  const thumbnail = useCallback((file: File, maxSize?: number) => createThumbnail(file, maxSize), [])

  return { compress, thumbnail }
}
