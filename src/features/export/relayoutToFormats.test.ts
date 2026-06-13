// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/features/ai/llmRouter', () => ({ generateJson: vi.fn() }))

import { generateJson } from '@/features/ai/llmRouter'
import { relayoutToFormats } from './relayoutToFormats'
import type { DesignObject } from './relayoutMultiFormat'

const generateJsonMock = vi.mocked(generateJson)

const objects: DesignObject[] = [
  { type: 'image', left: 0, top: 0, width: 1000, height: 1000, scaleX: 1, scaleY: 1, data: { role: 'background' } },
]
const targets = [
  { id: 'story', label: 'Story / Reel', w: 1080, h: 1920 },
  { id: 'banniere', label: 'Bannière', w: 1500, h: 500 },
] as const

beforeEach(() => generateJsonMock.mockReset())

describe('relayoutToFormats', () => {
  it('applique le placement LLM quand il répond', async () => {
    generateJsonMock.mockResolvedValue({
      formats: [
        { id: 'story', elements: [{ i: 0, xPct: 0, yPct: 0, wPct: 1, hPct: 1, fit: 'cover' }] },
        { id: 'banniere', elements: [{ i: 0, xPct: 0, yPct: 0, wPct: 1, hPct: 1, fit: 'cover' }] },
      ],
    } as never)
    const { byFormat, usedFallback } = await relayoutToFormats({ imageDataUri: 'data:,', objects, srcW: 1000, srcH: 1000, targets })
    expect(usedFallback).toBe(false)
    // cover story : f = max(1080/1000, 1920/1000) = 1.92
    expect(byFormat.story[0].scaleX).toBeCloseTo(1.92, 5)
    expect(byFormat.banniere[0]).toBeDefined()
  })

  it("retombe sur l'homothétie si le LLM lève", async () => {
    // Simule un échec LLM en retournant null : res.formats.find() lèvera une TypeError
    // dans relayoutToFormats (sans créer d'Error dans le contexte de test).
    generateJsonMock.mockResolvedValue(null as never)
    const { byFormat, usedFallback } = await relayoutToFormats({ imageDataUri: 'data:,', objects, srcW: 1000, srcH: 1000, targets })
    expect(usedFallback).toBe(true)
    // homothétie contain story : s = min(1.08, 1.92) = 1.08
    expect(byFormat.story[0].scaleX).toBeCloseTo(1.08, 5)
    expect(Object.keys(byFormat)).toEqual(['story', 'banniere'])
  })

  it('repli si un format est absent de la réponse', async () => {
    generateJsonMock.mockResolvedValue({ formats: [{ id: 'story', elements: [{ i: 0, xPct: 0, yPct: 0, wPct: 1, hPct: 1, fit: 'cover' }] }] } as never)
    const { byFormat } = await relayoutToFormats({ imageDataUri: 'data:,', objects, srcW: 1000, srcH: 1000, targets })
    expect(byFormat.story[0].scaleX).toBeCloseTo(1.92, 5) // LLM
    expect(byFormat.banniere[0].scaleX).toBeCloseTo(0.5, 5) // homothétie : min(1500/1000,500/1000)=0.5
  })
})
