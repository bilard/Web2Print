import { describe, it, expect } from 'vitest'
import { buildSceneInventory, repairMotionPlan } from './promptToMotionPlan'
import type { CanvasObjectProps } from '@/stores/editor.store'

const obj = (p: Partial<Omit<CanvasObjectProps, 'type'>> & { type?: string }): CanvasObjectProps => ({
  id: 'x', type: 'rect', x: 0, y: 0, width: 10, height: 10,
  ...p,
} as CanvasObjectProps)

describe('buildSceneInventory', () => {
  it('aplatit les objets (y compris enfants) en {id,label,type,bbox}', () => {
    const objs = [
      obj({ id: 'a', type: 'textbox', text: '22,99 DT', x: 5, y: 6, width: 30, height: 12 }),
      obj({ id: 'b', type: 'group', children: [obj({ id: 'c', type: 'image', name: 'logo' })] }),
    ]
    const inv = buildSceneInventory(objs)
    expect(inv.map((o) => o.id)).toEqual(['a', 'b', 'c'])
    expect(inv[0]).toMatchObject({ id: 'a', label: '22,99 DT', type: 'textbox', bbox: { x: 5, y: 6, w: 30, h: 12 } })
    expect(inv[2].label).toBe('logo')
  })

  it('tronque les labels longs et retombe sur le type si pas de texte/nom', () => {
    const inv = buildSceneInventory([
      obj({ id: 'a', type: 'textbox', text: 'x'.repeat(80) }),
      obj({ id: 'b', type: 'circle' }),
    ])
    expect(inv[0].label.length).toBeLessThanOrEqual(48)
    expect(inv[1].label).toBe('circle')
  })
})

describe('repairMotionPlan', () => {
  it('garde les directives valides et droppe celles dont la cible est inconnue', () => {
    const raw = {
      fromScratch: false,
      directives: [
        { target: 'a', phase: 'loop', effect: 'tilt3d', intensity: 0.6 },
        { target: 'inconnu', phase: 'loop', effect: 'pulse' },
        { target: 'all', phase: 'entry', effect: 'slide-in', direction: 'left' },
      ],
    }
    const plan = repairMotionPlan(raw, ['a', 'b'])
    expect(plan.directives.map((d) => d.target)).toEqual(['a', 'all'])
    expect(plan.fromScratch).toBe(false)
  })

  it('droppe les effets/phases invalides et clamp intensity', () => {
    const raw = {
      fromScratch: true,
      directives: [
        { target: 'a', phase: 'loop', effect: 'NOPE' },
        { target: 'a', phase: 'BAD', effect: 'pulse' },
        { target: 'a', phase: 'loop', effect: 'glow', intensity: 9 },
      ],
    }
    const plan = repairMotionPlan(raw, ['a'])
    expect(plan.directives).toHaveLength(1)
    expect(plan.directives[0].intensity).toBe(1)
    expect(plan.fromScratch).toBe(true)
  })

  it('retourne un plan vide sur entrée non-objet', () => {
    expect(repairMotionPlan(null, ['a'])).toEqual({ fromScratch: false, directives: [] })
  })
})
