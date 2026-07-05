import { test, expect } from 'vitest'
import { CARD_OBJECT_IDS, DEFAULT_CARD_STYLE } from '../../catalogTypes'
import { freeLayoutBox, FREE_DEFAULT_LAYOUT } from './freeLayout'

test('FREE_DEFAULT_LAYOUT couvre tous les objets', () => {
  for (const id of CARD_OBJECT_IDS) expect(FREE_DEFAULT_LAYOUT[id]).toBeDefined()
})

test('freeLayoutBox : repli quand aucun override', () => {
  expect(freeLayoutBox('name', DEFAULT_CARD_STYLE)).toEqual(FREE_DEFAULT_LAYOUT.name)
})

test('freeLayoutBox : override fusionné sur le repli', () => {
  const style = { ...DEFAULT_CARD_STYLE, layout: { name: { x: 10, y: 20 } } }
  expect(freeLayoutBox('name', style)).toEqual({ x: 10, y: 20, w: 92 })
})

test('FREE_DEFAULT_LAYOUT : calqué sur l\'auto (image haut, textes empilés, rangée basse)', () => {
  const { promo, image, name, description, details, ref, price } = FREE_DEFAULT_LAYOUT
  expect(promo.y).toBeLessThan(image.y)
  expect(image.y).toBeLessThan(name.y)
  expect(name.y).toBeLessThan(description.y)
  expect(description.y).toBeLessThan(details.y)
  expect(details.y).toBeLessThan(ref.y) // détails au-dessus de la rangée basse
  expect(price.y).toBeGreaterThan(details.y) // prix en bas de carte
})
