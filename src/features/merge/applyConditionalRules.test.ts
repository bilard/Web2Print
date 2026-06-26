import { describe, it, expect } from 'vitest'
import { applyConditionalRulesForRow } from './applyConditionalRules'
import type { ConditionalRule } from './conditionalRules'
import type { MergeRow, MergeColumn } from '@/stores/merge.store'

// Faux objet Fabric minimal : set() écrit la propriété, setCoords() no-op.
function fakeObj(rules: ConditionalRule[]) {
  return {
    visible: true, fill: '#000000', opacity: 1, scaleX: 1, scaleY: 1,
    data: { id: 'o1', conditionalRules: rules } as Record<string, unknown>,
    set(p: string, v: unknown) { (this as Record<string, unknown>)[p] = v },
    setCoords() {},
  }
}

const front: unknown[] = []
const fakeCanvas = (obj: unknown) => ({
  getObjects: () => [obj],
  bringObjectToFront: (o: unknown) => front.push(o),
  sendObjectToBack: () => {},
})

const columns: MergeColumn[] = [{ key: 'stock', label: 'Stock', fieldType: 'number' }]
const row = (stock: unknown): MergeRow => ({ _id: 'r', stock }) as MergeRow

describe('applyConditionalRulesForRow — réversibilité par ligne', () => {
  it('cache puis ré-affiche selon la valeur (pas d’effet collé)', () => {
    const obj = fakeObj([
      { id: '1', field: 'stock', operator: 'lte', value: '0', action: { type: 'hide' } },
    ])
    const canvas = fakeCanvas(obj) as never

    applyConditionalRulesForRow(canvas, row(0), columns)
    expect(obj.visible).toBe(false) // stock 0 → caché

    applyConditionalRulesForRow(canvas, row(5), columns)
    expect(obj.visible).toBe(true) // stock 5 → restauré (baseline)

    applyConditionalRulesForRow(canvas, row(0), columns)
    expect(obj.visible).toBe(false) // re-caché correctement
  })

  it('change la couleur puis restaure la baseline', () => {
    const obj = fakeObj([
      { id: '1', field: 'stock', operator: 'lte', value: '0', action: { type: 'setColor', color: '#e11d48' } },
    ])
    const canvas = fakeCanvas(obj) as never

    applyConditionalRulesForRow(canvas, row(0), columns)
    expect(obj.fill).toBe('#e11d48')

    applyConditionalRulesForRow(canvas, row(5), columns)
    expect(obj.fill).toBe('#000000') // restauré à la couleur d'origine
  })

  it('applique un facteur d’échelle relatif à la baseline, sans cumul entre passes', () => {
    const obj = fakeObj([
      { id: '1', field: 'stock', operator: 'lte', value: '0', action: { type: 'scale', scale: 2 } },
    ])
    const canvas = fakeCanvas(obj) as never

    applyConditionalRulesForRow(canvas, row(0), columns)
    expect(obj.scaleX).toBe(2)

    // Deuxième passe « on » : pas de cumul (×2 sur baseline 1, pas ×4).
    applyConditionalRulesForRow(canvas, row(0), columns)
    expect(obj.scaleX).toBe(2)

    applyConditionalRulesForRow(canvas, row(5), columns)
    expect(obj.scaleX).toBe(1) // restauré
  })
})
