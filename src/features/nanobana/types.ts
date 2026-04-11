export interface GalleryImage {
  id: string
  name: string
  url: string
  thumbnailUrl: string
  storagePath: string
  width: number
  height: number
  sizeBytes: number
  compressedSizeBytes: number
  mimeType: string
  createdAt: number
  tags: string[]
}

export interface GenerationRequest {
  prompt: string
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
  /** Base64 source image for image-to-image editing */
  sourceImageBase64?: string
  sourceImageMimeType?: string
  /** Target dimensions from selected block (pixels) */
  targetWidth?: number
  targetHeight?: number
}

export interface CompressionOptions {
  maxWidth: number
  maxHeight: number
  quality: number // 0-1
  format: 'image/jpeg' | 'image/webp' | 'image/png'
}

export interface CompressionResult {
  blob: Blob
  width: number
  height: number
  originalSize: number
  compressedSize: number
}

export type NanoBanaTab =
  | 'gallery'
  | 'upload'
  | 'generate'
  | 'stock'
  | 'my-images'
  | 'favorites'
  | 'collections'
  | 'recent'
