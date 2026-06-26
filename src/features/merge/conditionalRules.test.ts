import { describe, it, expect } from 'vitest'
import {
  evaluateCondition,
  resolveEffect,
  actionWithDefaults,
  DEFAULT_RULE_COLOR,
  DEFAULT_RULE_OPACITY,
  DEFAULT_RULE_SCALE,
  type ConditionalRule,
} from './conditionalRules'
import type { MergeRow, MergeColumn } from '@/stores/merge.store'

describe('evaluateCondition — chaîne', () => {
  it('contains / notContains (insensible casse)', () => {
    expect(evaluateCondition('contains', 'Crème Hydratante', 'crème')).toBe(true)
    expect(evaluateCondition('contains', 'Crème', 'gel')).toBe(false)
    expect(evaluateCondition('notContains', 'Crème', 'gel')).toBe(true)
  })

  it('is / isNot = égalité chaîne exacte (trim, casse)', () => {
    expect(evaluateCondition('is', '  Promo ', 'promo')).toBe(true)
    expect(evaluateCondition('is', 'Promo', 'promotion')).toBe(false)
    expect(evaluateCondition('isNot', 'Promo', 'Solde')).toBe(true)
  })

  it('startsWith / endsWith et leurs négations', () => {
    expect(evaluateCondition('startsWith', 'REF-1234', 'ref-')).toBe(true)
    expect(evaluateCondition('endsWith', 'image.png', '.png')).toBe(true)
    expect(evaluateCondition('notStartsWith', 'REF-1234', 'sku')).toBe(true)
    expect(evaluateCondition('notEndsWith', 'image.png', '.jpg')).toBe(true)
  })
})

describe('evaluateCondition — présence', () => {
  it('isEmpty / isNotEmpty traitent null, undefined et espaces', () => {
    expect(evaluateCondition('isEmpty', '', undefined)).toBe(true)
    expect(evaluateCondition('isEmpty', '   ', undefined)).toBe(true)
    expect(evaluateCondition('isEmpty', null, undefined)).toBe(true)
    expect(evaluateCondition('isEmpty', undefined, undefined)).toBe(true)
    expect(evaluateCondition('isEmpty', 'x', undefined)).toBe(false)
    expect(evaluateCondition('isNotEmpty', 'x', undefined)).toBe(true)
    expect(evaluateCondition('isNotEmpty', '  ', undefined)).toBe(false)
  })
})

describe('evaluateCondition — numérique', () => {
  it('compare après coercion, virgule FR tolérée', () => {
    expect(evaluateCondition('gt', '10', '5')).toBe(true)
    expect(evaluateCondition('gt', '5', '10')).toBe(false)
    expect(evaluateCondition('gte', '5', '5')).toBe(true)
    expect(evaluateCondition('lt', '3', '5')).toBe(true)
    expect(evaluateCondition('lte', '5', '5')).toBe(true)
    expect(evaluateCondition('eq', '12,50', '12.5')).toBe(true)
    expect(evaluateCondition('neq', '12,50', '12.6')).toBe(true)
  })

  it('valeur non numérique ⇒ false (jamais un faux positif)', () => {
    expect(evaluateCondition('gt', 'abc', '5')).toBe(false)
    expect(evaluateCondition('eq', '', '0')).toBe(false)
    expect(evaluateCondition('neq', 'abc', '5')).toBe(false)
  })

  it('« Est » (chaîne) ≠ « Est égal à » (numérique)', () => {
    // '007' vs '7' : différent en chaîne, égal en numérique.
    expect(evaluateCondition('is', '007', '7')).toBe(false)
    expect(evaluateCondition('eq', '007', '7')).toBe(true)
  })
})

describe('actionWithDefaults — paramètre par défaut renseigné', () => {
  it('initialise color/opacity/scale (sinon action ignorée par le moteur)', () => {
    expect(actionWithDefaults('setColor')).toEqual({ type: 'setColor', color: DEFAULT_RULE_COLOR })
    expect(actionWithDefaults('setOpacity')).toEqual({ type: 'setOpacity', opacity: DEFAULT_RULE_OPACITY })
    expect(actionWithDefaults('scale')).toEqual({ type: 'scale', scale: DEFAULT_RULE_SCALE })
    expect(actionWithDefaults('hide')).toEqual({ type: 'hide' })
  })

  it('préserve un paramètre déjà choisi', () => {
    expect(actionWithDefaults('setColor', { type: 'setColor', color: '#000' })).toEqual({ type: 'setColor', color: '#000' })
    expect(actionWithDefaults('scale', { type: 'scale', scale: 2 })).toEqual({ type: 'scale', scale: 2 })
  })

  it('une action setColor sans couleur ne produit AUCUN effet (régression)', () => {
    const row = { _id: 'r', x: 'v' } as never
    const broken: ConditionalRule[] = [
      { id: '1', field: 'x', operator: 'isNotEmpty', action: { type: 'setColor' } },
    ]
    expect(resolveEffect(broken, row)).toEqual({})
    const fixed: ConditionalRule[] = [
      { id: '1', field: 'x', operator: 'isNotEmpty', action: actionWithDefaults('setColor') },
    ]
    expect(resolveEffect(fixed, row)).toEqual({ fill: DEFAULT_RULE_COLOR })
  })
})

describe('resolveEffect — combinaison règles → effet visuel', () => {
  const columns: MergeColumn[] = [
    { key: 'stock', label: 'Stock', fieldType: 'number' },
    { key: 'promo', label: 'Promo', fieldType: 'text' },
  ]
  const row = (stock: unknown, promo: unknown): MergeRow =>
    ({ _id: 'r', stock, promo }) as MergeRow

  it('aucune règle ⇒ effet vide', () => {
    expect(resolveEffect([], row(5, ''), columns)).toEqual({})
    expect(resolveEffect(undefined, row(5, ''), columns)).toEqual({})
  })

  it('cache l’objet quand le stock est à zéro', () => {
    const rules: ConditionalRule[] = [
      { id: '1', field: 'stock', operator: 'lte', value: '0', action: { type: 'hide' } },
    ]
    expect(resolveEffect(rules, row(0, ''), columns)).toEqual({ visible: false })
    expect(resolveEffect(rules, row(3, ''), columns)).toEqual({})
  })

  it('change la couleur quand promo n’est pas vide', () => {
    const rules: ConditionalRule[] = [
      { id: '1', field: 'promo', operator: 'isNotEmpty', action: { type: 'setColor', color: '#e11d48' } },
    ]
    expect(resolveEffect(rules, row(5, '-20%'), columns)).toEqual({ fill: '#e11d48' })
    expect(resolveEffect(rules, row(5, ''), columns)).toEqual({})
  })

  it('résout le champ par label autant que par key', () => {
    const rules: ConditionalRule[] = [
      { id: '1', field: 'Stock', operator: 'gt', value: '0', action: { type: 'show' } },
    ]
    expect(resolveEffect(rules, row(2, ''), columns)).toEqual({ visible: true })
  })

  it('dernière règle gagne par propriété, scale cumulatif', () => {
    const rules: ConditionalRule[] = [
      { id: '1', field: 'stock', operator: 'gt', value: '0', action: { type: 'setColor', color: '#000' } },
      { id: '2', field: 'stock', operator: 'gt', value: '0', action: { type: 'setColor', color: '#fff' } },
      { id: '3', field: 'stock', operator: 'gt', value: '0', action: { type: 'scale', scale: 2 } },
      { id: '4', field: 'stock', operator: 'gt', value: '0', action: { type: 'scale', scale: 1.5 } },
    ]
    expect(resolveEffect(rules, row(5, ''), columns)).toEqual({ fill: '#fff', scale: 3 })
  })

  it('respecte fieldMap explicite', () => {
    const rules: ConditionalRule[] = [
      { id: '1', field: 'qty', operator: 'gt', value: '0', action: { type: 'hide' } },
    ]
    const fieldMap = { qty: 'stock' }
    expect(resolveEffect(rules, row(4, ''), columns, fieldMap)).toEqual({ visible: false })
  })
})
