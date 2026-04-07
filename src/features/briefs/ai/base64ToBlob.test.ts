import { describe, it, expect } from 'vitest'
import { base64ToBlob, mimeTypeToExtension } from './base64ToBlob'

describe('base64ToBlob', () => {
  it('decodes a small PNG header into a Blob with the right size and type', async () => {
    // 8 bytes = PNG signature
    const pngHeader = 'iVBORw0KGgo='
    const blob = base64ToBlob(pngHeader, 'image/png')
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBe(8)
  })

  it('strips a data URL prefix if present', () => {
    const blob = base64ToBlob('data:image/png;base64,iVBORw0KGgo=', 'image/png')
    expect(blob.size).toBe(8)
  })

  it('throws on invalid base64', () => {
    expect(() => base64ToBlob('!!!not base64!!!', 'image/png')).toThrow()
  })
})

describe('mimeTypeToExtension', () => {
  it('maps common mime types', () => {
    expect(mimeTypeToExtension('image/png')).toBe('png')
    expect(mimeTypeToExtension('image/jpeg')).toBe('jpg')
    expect(mimeTypeToExtension('image/webp')).toBe('webp')
  })

  it('falls back to png for unknown types', () => {
    expect(mimeTypeToExtension('application/octet-stream')).toBe('png')
  })
})
