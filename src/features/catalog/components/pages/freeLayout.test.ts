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
  expect(freeLayoutBox('name', style)).toEqual({ x: 10, y: 20, w: 88 })
})
