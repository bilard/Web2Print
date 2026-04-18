import { describe, it, expect } from 'vitest'
import { getLayerSwatchColor } from './getLayerSwatchColor'
import type { CanvasObjectProps } from '@/stores/editor.store'

function make(partial: Partial<CanvasObjectProps> = {}): CanvasObjectProps {
  return {
    id: 'x', type: 'rect', name: '', visible: true, locked: false,
    x: 0, y: 0, width: 10, height: 10,
    fill: '#ff0000', stroke: '', strokeWidth: 0, opacity: 1, angle: 0,
    flipX: false, flipY: false,
    ...partial,
  }
}

describe('getLayerSwatchColor', () => {
  it('retourne fill pour fillType solid', () => {
    const o = make({ fillType: 'solid', fill: '#123456' })
    expect(getLayerSwatchColor(o)).toEqual({ kind: 'solid', color: '#123456' })
  })

  it('retourne fill pour fillType manquant (défaut solid)', () => {
    const o = make({ fill: '#abcdef' })
    expect(getLayerSwatchColor(o)).toEqual({ kind: 'solid', color: '#abcdef' })
  })

  it('retourne le 1er stop pour fillType gradient', () => {
    const o = make({
      fillType: 'gradient',
      gradient: { type: 'linear', angle: 0, stops: [{ offset: 0, color: '#111' }, { offset: 1, color: '#222' }] },
    })
    expect(getLayerSwatchColor(o)).toEqual({ kind: 'solid', color: '#111' })
  })

  it('retourne "image" pour fillType image', () => {
    const o = make({ fillType: 'image' })
    expect(getLayerSwatchColor(o)).toEqual({ kind: 'image' })
  })

  it('retourne "none" pour fillType none', () => {
    const o = make({ fillType: 'none' })
    expect(getLayerSwatchColor(o)).toEqual({ kind: 'none' })
  })

  it('retourne "group" pour un groupe', () => {
    const o = make({ type: 'group' })
    expect(getLayerSwatchColor(o)).toEqual({ kind: 'group' })
  })
})
