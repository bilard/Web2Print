// @vitest-environment jsdom
import { test, expect } from 'vitest'
import { CARD_OBJECT_IDS, DEFAULT_CARD_STYLE } from '../../catalogTypes'
import { applyMagneticFlow, freeLayoutBox, FREE_DEFAULT_LAYOUT } from './freeLayout'

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

test('applyMagneticFlow : un bloc volumineux POUSSE vers le bas ceux qui le chevauchent (jamais de superposition)', () => {
  const card = document.createElement('div')
  Object.defineProperty(card, 'clientHeight', { value: 1000 })
  Object.defineProperty(card, 'clientWidth', { value: 1000 })
  const mk = (id: string, h: number) => {
    const el = document.createElement('div')
    el.className = 'cat-obj'
    el.setAttribute('data-object-id', id)
    Object.defineProperty(el, 'offsetHeight', { value: h })
    Object.defineProperty(el, 'offsetWidth', { value: 400 })
    card.appendChild(el)
    return el
  }
  // description (y58, w92) très volumineuse : 250px → descend jusqu'à 830px.
  const desc = mk('description', 250)
  const details = mk('details', 60) // y68 configuré (680) < 833 → poussé à 833
  const ref = mk('ref', 20)         // y88 configuré (880) < 833+60+3=896 → poussé
  const price = mk('price', 80)     // PAS dans la chaîne : intouché
  const style = { ...DEFAULT_CARD_STYLE, freeLayout: true, layout: {} }
  applyMagneticFlow(card, style)
  expect(parseFloat(desc.style.top)).toBeCloseTo(58, 0)
  expect(parseFloat(details.style.top)).toBeCloseTo(83.3, 0) // 580+250+3 = 833px
  expect(parseFloat(ref.style.top)).toBeCloseTo(89.6, 0)     // 833+60+3 = 896px
  expect(price.style.top).toBe('') // le prix (colonne droite) n'est pas aimanté
})

test('applyMagneticFlow : pas de poussée sans recouvrement horizontal (colonnes indépendantes)', () => {
  const card = document.createElement('div')
  Object.defineProperty(card, 'clientHeight', { value: 1000 })
  Object.defineProperty(card, 'clientWidth', { value: 1000 })
  const mk = (id: string, h: number) => {
    const el = document.createElement('div')
    el.className = 'cat-obj'
    el.setAttribute('data-object-id', id)
    Object.defineProperty(el, 'offsetHeight', { value: h })
    Object.defineProperty(el, 'offsetWidth', { value: 300 })
    card.appendChild(el)
    return el
  }
  const details = mk('details', 300) // colonne GAUCHE x5 w48 → descend loin
  const ref = mk('ref', 20)
  // réf déplacée en colonne DROITE (x60) : aucun recouvrement avec détails (x5–53)
  const style = { ...DEFAULT_CARD_STYLE, freeLayout: true, layout: { ref: { x: 60, y: 88, w: 35 } } }
  applyMagneticFlow(card, style)
  expect(parseFloat(details.style.top)).toBeCloseTo(68, 0)
  expect(parseFloat(ref.style.top)).toBeCloseTo(88, 0) // reste à SA position
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
