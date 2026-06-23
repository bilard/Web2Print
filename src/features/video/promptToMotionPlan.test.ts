import { describe, it, expect } from 'vitest'
import { buildSceneInventory, repairMotionPlan, normalizeCascadeStagger, type MotionPlan } from './promptToMotionPlan'
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

describe('normalizeCascadeStagger', () => {
  const plan = (...d: MotionPlan['directives']): MotionPlan => ({ fromScratch: false, directives: d })

  it('injecte un stagger sur la SORTIE quand la cascade est demandée en entrée ET en sortie', () => {
    const prompt =
      "tous les éléments entrent depuis la gauche en cascade, et en fin de l'animation tous les éléments sortent vers la droite en cascade"
    const out = normalizeCascadeStagger(
      plan(
        { target: 'all', phase: 'entry', effect: 'slide-in', direction: 'left' },
        { target: 'all', phase: 'exit', effect: 'slide-out', direction: 'right' },
      ),
      prompt,
    )
    expect(out.directives[0].stagger).toBeGreaterThan(0)
    expect(out.directives[1].stagger).toBeGreaterThan(0) // la régression : la sortie cascade aussi
  })

  it('ne touche pas la sortie si seule l’entrée est en cascade', () => {
    const out = normalizeCascadeStagger(
      plan(
        { target: 'all', phase: 'entry', effect: 'slide-in' },
        { target: 'all', phase: 'exit', effect: 'slide-out' },
      ),
      'les éléments entrent en cascade puis sortent à droite',
    )
    expect(out.directives[0].stagger).toBeGreaterThan(0)
    expect(out.directives[1].stagger).toBeUndefined()
  })

  it('préserve un stagger déjà fixé et ne fait rien sans cascade demandée', () => {
    const kept = normalizeCascadeStagger(
      plan({ target: 'all', phase: 'exit', effect: 'slide-out', stagger: 0.4 }),
      'sortent en cascade',
    )
    expect(kept.directives[0].stagger).toBe(0.4)
    const noop = normalizeCascadeStagger(
      plan({ target: 'all', phase: 'exit', effect: 'slide-out' }),
      'les éléments sortent vers la droite',
    )
    expect(noop.directives[0].stagger).toBeUndefined()
  })
})
