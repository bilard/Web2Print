import { describe, it, expect } from 'vitest'
import { sampleAvgColorAroundBbox } from './sampleColor'

function makeImage(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void): HTMLImageElement {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d')!
  paint(ctx)
  const dataUrl = c.toDataURL('image/png')
  const img = new Image()
  img.src = dataUrl
  // jsdom Image doesn't fire onload synchronously; we set width/height directly for the helper
  Object.defineProperty(img, 'naturalWidth', { value: width })
  Object.defineProperty(img, 'naturalHeight', { value: height })
  Object.defineProperty(img, 'width', { value: width, configurable: true })
  Object.defineProperty(img, 'height', { value: height, configurable: true })
  // Inject the source canvas as the decoded source for the helper
  ;(img as unknown as { __testCanvas: HTMLCanvasElement }).__testCanvas = c
  return img
}

describe('sampleAvgColorAroundBbox', () => {
  it('échantillonne le rouge pur autour d\'une bbox sur fond rouge', () => {
    const img = makeImage(100, 100, (ctx) => {
      ctx.fillStyle = '#ff0000'
      ctx.fillRect(0, 0, 100, 100)
      // text noir au centre — ne doit PAS être sampled
      ctx.fillStyle = '#000000'
      ctx.fillRect(40, 40, 20, 20)
    })
    const color = sampleAvgColorAroundBbox(img, { x: 40, y: 40, w: 20, h: 20 })
    expect(color.toLowerCase()).toBe('#ff0000')
  })

  it('moyenne pondérée si fond bicolore', () => {
    const img = makeImage(200, 100, (ctx) => {
      ctx.fillStyle = '#ff0000'
      ctx.fillRect(0, 0, 100, 100)
      ctx.fillStyle = '#0000ff'
      ctx.fillRect(100, 0, 100, 100)
    })
    // bbox au centre → moitié rouge moitié bleu autour
    const color = sampleAvgColorAroundBbox(img, { x: 47, y: 40, w: 6, h: 20 })
    // moyenne attendue ~ #800080 (purple)
    expect(color.toLowerCase()).toMatch(/^#[78][0-9a-f]00[78][0-9a-f]$/)
  })

  it('clampe la zone de sampling aux bornes de l\'image', () => {
    const img = makeImage(50, 50, (ctx) => {
      ctx.fillStyle = '#00ff00'
      ctx.fillRect(0, 0, 50, 50)
    })
    // bbox qui touche le bord — la zone d'échantillonnage doit clamp
    const color = sampleAvgColorAroundBbox(img, { x: 0, y: 0, w: 100, h: 100 })
    expect(color.toLowerCase()).toBe('#00ff00')
  })
})
