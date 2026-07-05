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
  // description (y58, w92) très volumineuse : 250px → pousse les détails à 836.
  // Le prix ANCRÉ BAS est un PLAFOND (top 900, plafond 894) : la description
  // (clippable, réserve réf 26) tient (288 dispo) ; les DÉTAILS se coupent à
  // 32px (894 − 836 − 26) ; la réf (mono-ligne, jamais coupée) garde sa ligne.
  const desc = mk('description', 250)
  const details = mk('details', 60)
  const ref = mk('ref', 20)         // hors de l'emprise du prix ([5,50] vs [58,98])
  const price = mk('price', 80)     // ancré bas-droite : obstacle, pas aimanté
  const style = { ...DEFAULT_CARD_STYLE, layout: {} }
  applyMagneticFlow(card, style)
  expect(parseFloat(desc.style.top)).toBeCloseTo(58, 0)
  expect(desc.style.maxHeight).toBe('')                      // 250 < 288 : intacte
  expect(parseFloat(details.style.top)).toBeCloseTo(83.6, 0) // 580+250+6 = 836px
  expect(details.style.maxHeight).toBe('32px')               // coupés au plafond − réserve réf
  expect(parseFloat(ref.style.top)).toBeCloseTo(87.4, 0)     // 836+32+6 = 874px (au-dessus du prix)
  expect(price.style.top).toBe('') // le prix (ancré bas) n'est pas déplacé
})

test('applyMagneticFlow : un prix DÉSANCRÉ (drag) reste un PLAFOND — les textes se coupent au-dessus, pas dessous', () => {
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
  const details = mk('details', 300) // y68 (680), volumineux : descendrait à 980
  mk('price', 150)                   // désancré à y75 (750) → plafond 744
  const style = { ...DEFAULT_CARD_STYLE, layout: { price: { x: 55, y: 75, w: 40, ax: 'l' as const, ay: 't' as const } } }
  applyMagneticFlow(card, style)
  expect(parseFloat(details.style.top)).toBeCloseTo(68, 0)
  expect(details.style.maxHeight).toBe('64px') // 744 − 680 : coupé AU-DESSUS du prix
})

test('applyMagneticFlow : CLAMP — un bloc désancré posé trop bas est REMONTÉ dans la carte (jamais coupé par le bord)', () => {
  const card = document.createElement('div')
  Object.defineProperty(card, 'clientHeight', { value: 1000 })
  Object.defineProperty(card, 'clientWidth', { value: 1000 })
  const price = document.createElement('div')
  price.className = 'cat-obj'
  price.setAttribute('data-object-id', 'price')
  Object.defineProperty(price, 'offsetHeight', { value: 200 })
  Object.defineProperty(price, 'offsetWidth', { value: 400 })
  card.appendChild(price)
  // Prix DÉSANCRÉ par un drag dans l'aperçu (ay:'t', y:90) : 900+200 > 1000.
  const style = { ...DEFAULT_CARD_STYLE, layout: { price: { x: 55, y: 90, w: 40, ax: 'l' as const, ay: 't' as const } } }
  applyMagneticFlow(card, style)
  expect(price.style.top).toBe('80%') // remonté au ras du bas (1000 − 200)
})

test('applyMagneticFlow : contenu COURT → l\'enfant REMONTE se coller (pas de trou)', () => {
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
  const desc = mk('description', 30) // y58, courte : 580→610
  const details = mk('details', 60)  // y68 configuré (680) → REMONTÉ collé à 616
  applyMagneticFlow(card, { ...DEFAULT_CARD_STYLE, layout: {} })
  expect(parseFloat(desc.style.top)).toBeCloseTo(58, 0)
  expect(parseFloat(details.style.top)).toBeCloseTo(61.6, 0) // 580+30+6 = 616px < 680 configuré
})

test('applyMagneticFlow : aimant PAR BLOC — un bloc détaché (m:false) reste à sa position mais sert de parent', () => {
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
  const desc = mk('description', 30)  // courte (580→610)
  const details = mk('details', 60)   // DÉTACHÉ, posé à y80 → ne remonte PAS
  const ref = mk('ref', 20)           // aimanté → collé SOUS le bloc détaché (800+60+6)
  const style = { ...DEFAULT_CARD_STYLE, layout: { details: { x: 5, y: 80, w: 48, m: false } } }
  applyMagneticFlow(card, style)
  expect(parseFloat(desc.style.top)).toBeCloseTo(58, 0)
  expect(parseFloat(details.style.top)).toBeCloseTo(80, 0)   // reste où il est posé
  expect(parseFloat(ref.style.top)).toBeCloseTo(86.6, 0)     // 800+60+6 = 866px
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
  const details = mk('details', 300) // posé en colonne GAUCHE (x5 w48) → descend loin
  const ref = mk('ref', 20)
  // réf déplacée en colonne DROITE (x60) : aucun recouvrement avec détails (x5–53)
  const style = { ...DEFAULT_CARD_STYLE, layout: { details: { x: 5, y: 68, w: 48 }, ref: { x: 60, y: 88, w: 35 } } }
  applyMagneticFlow(card, style)
  expect(parseFloat(details.style.top)).toBeCloseTo(68, 0)
  expect(parseFloat(ref.style.top)).toBeCloseTo(88, 0) // reste à SA position
})

test('applyMagneticFlow : bloc LIÉ soudé à droite de sa cible (aligné en haut), hors chaîne verticale', () => {
  const card = document.createElement('div')
  Object.defineProperty(card, 'clientHeight', { value: 1000 })
  Object.defineProperty(card, 'clientWidth', { value: 1000 })
  const mk = (id: string, h: number, extra?: { left?: number; width?: number; top?: number }) => {
    const el = document.createElement('div')
    el.className = 'cat-obj'
    el.setAttribute('data-object-id', id)
    Object.defineProperty(el, 'offsetHeight', { value: h })
    Object.defineProperty(el, 'offsetWidth', { value: extra?.width ?? 400 })
    Object.defineProperty(el, 'offsetLeft', { value: extra?.left ?? 0 })
    Object.defineProperty(el, 'offsetTop', { value: extra?.top ?? 0 })
    card.appendChild(el)
    return el
  }
  mk('ref', 20, { left: 50, width: 200, top: 880 })
  const unit = mk('unit', 20)
  const style = { ...DEFAULT_CARD_STYLE, layout: { unit: { x: 5, y: 92, link: 'ref' as const } } }
  applyMagneticFlow(card, style)
  expect(parseFloat(unit.style.left)).toBeCloseTo(25.6, 1) // (50+200+6)/1000
  expect(parseFloat(unit.style.top)).toBeCloseTo(88, 0)    // aligné sur le haut de la réf
  // Décalage lx/ly (glisser SANS rompre la liaison) : ajouté au point de soudure.
  const style2 = { ...DEFAULT_CARD_STYLE, layout: { unit: { x: 5, y: 92, link: 'ref' as const, lx: 4, ly: -2 } } }
  applyMagneticFlow(card, style2)
  expect(parseFloat(unit.style.left)).toBeCloseTo(29.6, 1)
  expect(parseFloat(unit.style.top)).toBeCloseTo(86, 0)
})

test('applyMagneticFlow : liaison CIRCULAIRE (réf↔unité) — le premier lien gagne, l\'autre est ignoré (pas de divergence)', () => {
  const card = document.createElement('div')
  Object.defineProperty(card, 'clientHeight', { value: 1000 })
  Object.defineProperty(card, 'clientWidth', { value: 1000 })
  const mk = (id: string, h: number, extra?: { left?: number; width?: number; top?: number }) => {
    const el = document.createElement('div')
    el.className = 'cat-obj'
    el.setAttribute('data-object-id', id)
    Object.defineProperty(el, 'offsetHeight', { value: h })
    Object.defineProperty(el, 'offsetWidth', { value: extra?.width ?? 400 })
    Object.defineProperty(el, 'offsetLeft', { value: extra?.left ?? 0 })
    Object.defineProperty(el, 'offsetTop', { value: extra?.top ?? 0 })
    card.appendChild(el)
    return el
  }
  const ref = mk('ref', 20)
  const unit = mk('unit', 20, { left: 50, width: 200, top: 880 })
  // Cycle stocké : réf liée à l'unité ET unité liée à la réf (état corrompu).
  const style = {
    ...DEFAULT_CARD_STYLE,
    layout: { ref: { x: 5, y: 90, link: 'unit' as const }, unit: { x: 5, y: 94, link: 'ref' as const } },
  }
  applyMagneticFlow(card, style) // ne doit ni boucler ni diverger
  // réf (premier lien dans CARD_OBJECT_IDS) soudée à droite de l'unité…
  expect(parseFloat(ref.style.left)).toBeCloseTo(25.6, 1) // (50+200+6)/1000
  expect(parseFloat(ref.style.top)).toBeCloseTo(88, 0)
  // …et le lien retour de l'unité est IGNORÉ : elle reste dans la chaîne verticale.
  expect(unit.style.left).toBe('')
})

test('FREE_DEFAULT_LAYOUT : design complet calqué sur l\'auto (bandeau, pile de textes, liaisons, prix ancré)', () => {
  const { promo, image, name, description, details, ref, unit, price } = FREE_DEFAULT_LAYOUT
  expect(promo).toMatchObject({ x: 0, y: 0, w: 100 }) // cartouche = bandeau pleine largeur
  expect(promo.y).toBeLessThan(image.y)
  expect(image.y).toBeLessThan(name.y)
  expect(name.y).toBeLessThan(description.y)
  expect(description.y).toBeLessThan(details.y)
  expect(details.y).toBeLessThan(ref.y) // détails au-dessus de la rangée basse
  expect(unit.link).toBe('ref')         // unité SOUDÉE à la réf
  expect(price.ax).toBe('r')            // prix ancré bas-droite (liquide)
  expect(price.ay).toBe('b')
})
