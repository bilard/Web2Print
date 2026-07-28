// @vitest-environment jsdom
import { test, expect } from 'vitest'
import { CARD_OBJECT_IDS, DEFAULT_CARD_STYLE } from '../../catalogTypes'
import { applyMagneticFlow, cardObjectOrder, freeLayoutBox, isWideCard, normalizeCardLinks, reorderCardObjects, FREE_DEFAULT_LAYOUT, FREE_WIDE_LAYOUT } from './freeLayout'

test('normalizeCardLinks : un override ref→unit + le lien PAR DÉFAUT unit→ref = cycle → le lien retour est posé à null (persistant)', () => {
  // Défauts : unit.link='ref'. Override : ref.link='unit' → cycle effectif.
  const style = { ...DEFAULT_CARD_STYLE, layout: { ref: { x: 5, y: 90, link: 'unit' as const } } }
  const norm = normalizeCardLinks(style)
  expect(norm).not.toBe(style)
  expect(freeLayoutBox('ref', norm).link).toBe('unit')  // premier lien déclaré (ordre CARD_OBJECT_IDS) : gagne
  expect(freeLayoutBox('unit', norm).link).toBeNull()   // lien retour ANNULÉ — null survit à stripUndefined
  // Idempotent : un style déjà propre est retourné TEL QUEL (pas de re-render inutile).
  expect(normalizeCardLinks(norm)).toBe(norm)
  expect(normalizeCardLinks(DEFAULT_CARD_STYLE)).toBe(DEFAULT_CARD_STYLE)
})

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

test('FREE_WIDE_LAYOUT (cartes pleine largeur) : 2 colonnes — image à gauche, textes à droite, ancrages préservés', () => {
  for (const id of CARD_OBJECT_IDS) expect(FREE_WIDE_LAYOUT[id]).toBeDefined()
  // Colonne 1 : l'image occupe la gauche pleine hauteur ; colonne 2 : TOUS les textes.
  const img = FREE_WIDE_LAYOUT.image
  expect(img.x + (img.w ?? 0)).toBeLessThanOrEqual(40)
  for (const id of ['brand', 'name', 'description', 'details', 'ref', 'unit'] as const) {
    expect(FREE_WIDE_LAYOUT[id].x).toBeGreaterThanOrEqual(img.x + (img.w ?? 0))
  }
  // Contraintes d'ancrage IDENTIQUES au design vertical : prix ancré bas-droite,
  // unité soudée à la réf, cartouche promo en bandeau pleine largeur.
  expect(FREE_WIDE_LAYOUT.price).toEqual(FREE_DEFAULT_LAYOUT.price)
  expect(FREE_WIDE_LAYOUT.unit.link).toBe('ref')
  expect(FREE_WIDE_LAYOUT.promo).toEqual(FREE_DEFAULT_LAYOUT.promo)
})

test('freeLayoutBox wide : repli 2 colonnes + overrides INDÉPENDANTS par variante', () => {
  expect(freeLayoutBox('image', DEFAULT_CARD_STYLE, true)).toEqual(FREE_WIDE_LAYOUT.image)
  // Un drag fait sur la carte VERTICALE (layout) ne déforme JAMAIS la carte
  // large — c'était le bug : l'image héritait de sa boîte pleine largeur.
  const style = { ...DEFAULT_CARD_STYLE, layout: { image: { x: 2, y: 4, w: 96, h: 42 } }, layoutWide: { name: { x: 45, y: 18 } } }
  expect(freeLayoutBox('image', style, true)).toEqual(FREE_WIDE_LAYOUT.image)
  expect(freeLayoutBox('name', style, true)).toEqual({ x: 45, y: 18, w: FREE_WIDE_LAYOUT.name.w })
  // Et réciproquement : layoutWide n'affecte pas la carte verticale.
  expect(freeLayoutBox('name', style, false)).toEqual(FREE_DEFAULT_LAYOUT.name)
})

test('normalizeCardLinks : purge un cycle dans layoutWide sans toucher layout', () => {
  const style = { ...DEFAULT_CARD_STYLE, layoutWide: { ref: { x: 40, y: 88, link: 'unit' as const } } }
  const norm = normalizeCardLinks(style)
  expect(freeLayoutBox('ref', norm, true).link).toBe('unit')
  expect(freeLayoutBox('unit', norm, true).link).toBeNull()
  expect(freeLayoutBox('unit', norm, false).link).toBe('ref') // variante verticale intacte
  expect(norm.layout).toEqual({})
})

test('isWideCard : bascule au ratio 1,3 (grilles 1 colonne & paysage larges ; verticales inchangées)', () => {
  expect(isWideCard(730, 484)).toBe(true)   // grille 2 (A4 portrait) : pleine largeur
  expect(isWideCard(730, 318)).toBe(true)   // grille 3
  expect(isWideCard(358, 484)).toBe(false)  // grille 4 : cellule portrait
  expect(isWideCard(358, 318)).toBe(false)  // grille 6 : quasi carrée
  expect(isWideCard(100, 0)).toBe(false)    // garde-fou division par zéro
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
  // Le prix ANCRÉ BAS ([58,98], top 900) est un PLAFOND : la description tient
  // (288 dispo avec la réserve réf) ; les DÉTAILS dépasseraient → ils sont
  // RÉTRÉCIS à gauche du prix (le texte se réécoule, aucune coupe) ; la réf
  // (mono-ligne, jamais coupée) garde sa ligne.
  const desc = mk('description', 250)
  const details = mk('details', 60)
  const ref = mk('ref', 20)         // hors de l'emprise du prix ([5,50] vs [58,98])
  const price = mk('price', 80)     // ancré bas-droite : obstacle, pas aimanté
  const style = { ...DEFAULT_CARD_STYLE, layout: {} }
  applyMagneticFlow(card, style)
  expect(parseFloat(desc.style.top)).toBeCloseTo(58, 0)
  expect(desc.style.maxHeight).toBe('')                      // 250 < 288 : intacte
  expect(parseFloat(details.style.top)).toBeCloseTo(83.6, 0) // 580+250+6 = 836px
  expect(details.style.width).toBe('51.5%')                  // rétrécis à gauche du prix (58−1,5−5)
  expect(details.style.maxHeight).toBe('')                   // hors de l'emprise → plus de coupe
  expect(parseFloat(ref.style.top)).toBeCloseTo(90.2, 0)     // 836+60+6 = 902px
  expect(price.style.top).toBe('') // le prix (ancré bas) n'est pas déplacé
})

test('applyMagneticFlow : le TABLEAU DE SPECS garde sa hauteur PLEINE — la prose (description) cède, jamais zéro ligne (fiche Démo express)', () => {
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
  // Description INTÉGRALE volumineuse (prose, duplique souvent les specs) suivie
  // des pavés de DONNÉES : détails (20), tableau specs (100), réf, prix ancré bas.
  // Le prix ([58,98], top 900) déclenche le rétrécissement latéral des pavés
  // (51,5 %), leur plafond remonte à 1000 → 394px dispo sous 580 (réserve réf).
  const desc = mk('description', 400)
  const details = mk('details', 20)
  const specs = mk('specs', 100)
  const ref = mk('ref', 20)
  mk('price', 80)
  applyMagneticFlow(card, { ...DEFAULT_CARD_STYLE, layout: {} })
  // La PROSE cède : 394 − (specs 100+6) − (plancher détails min(20,24)+6) = 262.
  expect(desc.style.maxHeight).toBe('262px')
  // Les DONNÉES gardent leur hauteur PLEINE (aucune coupe) :
  expect(details.style.maxHeight).toBe('')
  expect(parseFloat(details.style.top)).toBeCloseTo(84.8, 0) // 580+262+6
  expect(specs.style.maxHeight).toBe('')                     // tableau ENTIER — plus jamais 0px
  expect(parseFloat(specs.style.top)).toBeCloseTo(87.4, 0)   // 848+20+6
  // La pile complète tient dans la carte : réf collée sous le tableau.
  expect(parseFloat(ref.style.top)).toBeCloseTo(98, 0)
})

test('applyMagneticFlow : un prix TOURNÉ plafonne par sa bbox RENDUE (rotation comprise), pas par offsetHeight', () => {
  const card = document.createElement('div')
  Object.defineProperty(card, 'clientHeight', { value: 1000 })
  Object.defineProperty(card, 'clientWidth', { value: 1000 })
  card.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000, x: 0, y: 0, toJSON: () => ({}) })
  const mk = (id: string, h: number) => {
    const el = document.createElement('div')
    el.className = 'cat-obj'
    el.setAttribute('data-object-id', id)
    Object.defineProperty(el, 'offsetHeight', { value: h })
    Object.defineProperty(el, 'offsetWidth', { value: 400 })
    card.appendChild(el)
    return el
  }
  const details = mk('details', 300) // y68 (680) → bas prospectif 980
  const price = mk('price', 80)      // ancré bas (y2 → boîte 900-980)…
  // …mais TOURNÉ : sa bbox écran monte à 850 et s'étale de x550 à x1000.
  price.getBoundingClientRect = () => ({ left: 550, top: 850, right: 1000, bottom: 990, width: 450, height: 140, x: 550, y: 850, toJSON: () => ({}) })
  applyMagneticFlow(card, { ...DEFAULT_CARD_STYLE, layout: {} })
  // Le pavé se RÉTRÉCIT à gauche de la bbox TOURNÉE (55 − 1,5 − 5 = 48,5 % ;
  // offsetWidth seul aurait donné x1=60 → 53,5 %) : une fois dégagé du badge,
  // aucune coupe nécessaire (le texte se réécoule dans la boîte plus étroite).
  expect(details.style.width).toBe('48.5%')
  expect(details.style.maxHeight).toBe('')
})

test('applyMagneticFlow : un badge ancré BAS dont la rotation déborde du bord est REMONTÉ (jamais coupé)', () => {
  const card = document.createElement('div')
  Object.defineProperty(card, 'clientHeight', { value: 1000 })
  Object.defineProperty(card, 'clientWidth', { value: 1000 })
  card.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000, x: 0, y: 0, toJSON: () => ({}) })
  const price = document.createElement('div')
  price.className = 'cat-obj'
  price.setAttribute('data-object-id', 'price')
  Object.defineProperty(price, 'offsetHeight', { value: 80 })
  Object.defineProperty(price, 'offsetWidth', { value: 400 })
  // Boîte ancrée bas (y2 → 900-980) mais bbox TOURNÉE : déborde à 1030 (+30 sous le bord).
  price.getBoundingClientRect = () => ({ left: 550, top: 890, right: 1000, bottom: 1030, width: 450, height: 140, x: 550, y: 890, toJSON: () => ({}) })
  card.appendChild(price)
  applyMagneticFlow(card, { ...DEFAULT_CARD_STYLE, layout: {} })
  // Remonté pour que la bbox ENTIÈRE respecte la marge configurée (2 %) :
  // excès = 1030 − (1000 − 20) = 50 → bottom = (20 + 50)/1000 = 7 %.
  expect(price.style.bottom).toBe('7%')
})

test('applyMagneticFlow : un badge DÉSANCRÉ (drag) et tourné est aussi remonté par sa bbox — plus jamais coupé en bas', () => {
  const card = document.createElement('div')
  Object.defineProperty(card, 'clientHeight', { value: 1000 })
  Object.defineProperty(card, 'clientWidth', { value: 1000 })
  card.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000, x: 0, y: 0, toJSON: () => ({}) })
  const price = document.createElement('div')
  price.className = 'cat-obj'
  price.setAttribute('data-object-id', 'price')
  Object.defineProperty(price, 'offsetHeight', { value: 80 })
  Object.defineProperty(price, 'offsetWidth', { value: 400 })
  // Boîte posée à y78 (780-860 : rentre) mais bbox TOURNÉE 760→1030 : déborde de 30.
  price.getBoundingClientRect = () => ({ left: 550, top: 760, right: 1000, bottom: 1030, width: 450, height: 270, x: 550, y: 760, toJSON: () => ({}) })
  card.appendChild(price)
  const style = { ...DEFAULT_CARD_STYLE, layout: { price: { x: 55, y: 78, w: 40, ax: 'l' as const, ay: 't' as const } } }
  applyMagneticFlow(card, style)
  // top visé : bbox bottom = cardH → (1000 − 270 − (760 − 780))/1000 = 75 %.
  expect(price.style.top).toBe('75%')
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
  mk('price', 150)                   // désancré à y75 (750), boîte [55,95] → plafond 744
  const style = { ...DEFAULT_CARD_STYLE, layout: { price: { x: 55, y: 75, w: 40, ax: 'l' as const, ay: 't' as const } } }
  applyMagneticFlow(card, style)
  expect(parseFloat(details.style.top)).toBeCloseTo(68, 0)
  expect(details.style.width).toBe('48.5%')   // RÉTRÉCIS à gauche du prix (55−1,5−5) : le texte se réécoule
  expect(details.style.maxHeight).toBe('')    // hors de l'emprise du prix → aucune coupe nécessaire
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

test('applyMagneticFlow : POUSSÉE DOUCE — un bloc détaché recouvert glisse vers le bas (jamais hors carte), le pavé garde sa place', () => {
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
  const desc = mk('description', 300) // y58 (580) volumineuse → bas 880
  const ref = mk('ref', 20)           // DÉTACHÉ à y66 (660) : recouvert → glisse à 886
  const style = { ...DEFAULT_CARD_STYLE, layout: { ref: { x: 5, y: 66, w: 45, m: false } } }
  applyMagneticFlow(card, style)
  expect(parseFloat(desc.style.top)).toBeCloseTo(58, 0)
  expect(desc.style.maxHeight).toBe('')                  // plafond = position la plus basse de la réf (974)
  expect(parseFloat(ref.style.top)).toBeCloseTo(88.6, 0) // 880+6 : poussé, pas superposé, dans la carte
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

test('reorderCardObjects : permute les y existants (aucune position inventée)', () => {
  // Ordre par défaut : name (52) au-dessus de description (58). On l'inverse.
  const out = reorderCardObjects(DEFAULT_CARD_STYLE, false, ['brand', 'description', 'name'], 'description')
  expect(freeLayoutBox('brand', out).y).toBe(48)
  expect(freeLayoutBox('description', out).y).toBe(52) // a pris le slot du nom
  expect(freeLayoutBox('name', out).y).toBe(58)        // a pris celui de la description
  // Les autres réglages de la boîte survivent (largeur hand-tunée).
  expect(freeLayoutBox('name', out).w).toBe(92)
  // La variante LARGE n'est pas touchée par un réordonnancement vertical.
  expect(out.layoutWide).toEqual(DEFAULT_CARD_STYLE.layoutWide)
})

test('reorderCardObjects : le bloc DÉPLACÉ est désancré/délié — les autres gardent leur nature', () => {
  // Prix ancré bas-droite : glissé dans la liste, il rejoint le flux vertical.
  const out = reorderCardObjects(DEFAULT_CARD_STYLE, false, ['name', 'price', 'description'], 'price')
  const price = freeLayoutBox('price', out)
  expect(price.ay).toBe('t')      // désancré : sinon le glisser n'aurait AUCUN effet
  expect(price.y).toBe(58)        // slot intermédiaire (52 · 58 · le sien, le plus bas)
  expect(price.ax).toBe('r')      // l'ancrage HORIZONTAL, lui, est conservé
  // L'unité (soudée à la réf) n'est pas le bloc déplacé : sa liaison survit.
  const out2 = reorderCardObjects(DEFAULT_CARD_STYLE, false, ['name', 'unit', 'description'], 'name')
  expect(freeLayoutBox('unit', out2).link).toBe('ref')
  expect(freeLayoutBox('unit', out2).y).toBe(FREE_DEFAULT_LAYOUT.unit.y) // hors flux : intacte
})

test('reorderCardObjects : écrit dans le jeu d\'overrides de la variante ÉDITÉE', () => {
  const out = reorderCardObjects(DEFAULT_CARD_STYLE, true, ['name', 'brand'], 'name')
  expect(freeLayoutBox('name', out, true).y).toBe(FREE_WIDE_LAYOUT.brand.y)
  expect(out.layout).toEqual(DEFAULT_CARD_STYLE.layout) // variante verticale intacte
})

test('reorderCardObjects : moins de 2 blocs dans le flux = aucun changement', () => {
  expect(reorderCardObjects(DEFAULT_CARD_STYLE, false, ['name'], 'name')).toBe(DEFAULT_CARD_STYLE)
})

test('cardObjectOrder : la liste suit l\'ordre RÉEL de la fiche (ancré bas en dernier)', () => {
  const ids = ['price', 'name', 'promo', 'image', 'description'] as const
  expect(cardObjectOrder(DEFAULT_CARD_STYLE, false, [...ids]))
    .toEqual(['promo', 'image', 'name', 'description', 'price']) // prix ancré BAS → fin de liste
  // Après un déplacement, la liste reflète la nouvelle position (aller-retour cohérent).
  const moved = reorderCardObjects(DEFAULT_CARD_STYLE, false, ['name', 'description'], 'description')
  expect(cardObjectOrder(moved, false, ['name', 'description'])).toEqual(['name', 'description'])
  const swapped = reorderCardObjects(DEFAULT_CARD_STYLE, false, ['description', 'name'], 'description')
  expect(cardObjectOrder(swapped, false, ['name', 'description'])).toEqual(['description', 'name'])
})
