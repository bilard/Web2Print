import { describe, it, expect } from 'vitest'
import {
  initCursor, currentTarget, advance, openSweep, harvestProgress, pageDocId,
  MAX_PAGES_PER_CATEGORY, type HarvestCursor,
} from './harvest'

const cats = ['https://c.fr/1-a', 'https://c.fr/2-b']

describe('initCursor', () => {
  it('démarre sur la première page de la première catégorie', () => {
    const c = initCursor(cats)
    expect(currentTarget(c)).toEqual({ categoryUrl: 'https://c.fr/1-a', page: 1 })
    expect(c.done).toBe(false)
  })
  it('est terminé d’emblée sans catégorie', () => {
    expect(initCursor([]).done).toBe(true)
    expect(currentTarget(initCursor([]))).toBeNull()
  })
})

describe('advance', () => {
  it('pagine tant qu’il y a une page suivante', () => {
    let c = initCursor(cats)
    c = advance(c, { hadItems: true, hasNext: true })
    expect(currentTarget(c)).toEqual({ categoryUrl: 'https://c.fr/1-a', page: 2 })
  })
  it('passe à la catégorie suivante en fin de pagination', () => {
    let c = initCursor(cats)
    c = advance(c, { hadItems: true, hasNext: false })
    expect(currentTarget(c)).toEqual({ categoryUrl: 'https://c.fr/2-b', page: 1 })
  })
  it('clôt la catégorie sur une page vide', () => {
    let c = initCursor(cats)
    c = advance(c, { hadItems: false, hasNext: true })
    expect(currentTarget(c)?.categoryUrl).toBe('https://c.fr/2-b')
  })
  it('termine le balayage après la dernière catégorie', () => {
    let c = initCursor(cats)
    c = advance(c, { hadItems: true, hasNext: false }) // → cat 2
    c = advance(c, { hadItems: true, hasNext: false }) // → fin
    expect(c.done).toBe(true)
    expect(currentTarget(c)).toBeNull()
  })
  it('clôt la catégorie quand la page suivante répète la précédente', () => {
    // Terrain : un site dont « ?page=N » renvoie toujours la page 1 a fait moissonner
    // 5 601 pages pour 230 produits réels — budget de moisson brûlé à vide.
    let c = initCursor(cats)
    c = advance(c, { hadItems: true, hasNext: true, signature: 'A' })
    expect(currentTarget(c)?.page).toBe(2)
    c = advance(c, { hadItems: true, hasNext: true, signature: 'A' })
    expect(currentTarget(c)).toEqual({ categoryUrl: 'https://c.fr/2-b', page: 1 })
  })
  it('continue de paginer tant que le contenu change', () => {
    let c = initCursor(cats)
    c = advance(c, { hadItems: true, hasNext: true, signature: 'A' })
    c = advance(c, { hadItems: true, hasNext: true, signature: 'B' })
    expect(currentTarget(c)).toEqual({ categoryUrl: 'https://c.fr/1-a', page: 3 })
  })
  it('ne confond pas deux catégories qui commencent pareil', () => {
    let c = initCursor(cats)
    c = advance(c, { hadItems: true, hasNext: false, signature: 'A' }) // → cat 2
    c = advance(c, { hadItems: true, hasNext: true, signature: 'A' })
    expect(currentTarget(c)).toEqual({ categoryUrl: 'https://c.fr/2-b', page: 2 })
  })
  it('respecte le plafond de pages par catégorie', () => {
    let c: HarvestCursor = { categories: cats, catIndex: 0, page: MAX_PAGES_PER_CATEGORY, sweeps: 0, done: false }
    c = advance(c, { hadItems: true, hasNext: true })
    // Ne dépasse pas le plafond : bascule sur la catégorie suivante.
    expect(currentTarget(c)).toEqual({ categoryUrl: 'https://c.fr/2-b', page: 1 })
  })
})

describe('balayage complet puis reprise', () => {
  it('parcourt tout, puis rouvre un balayage en incrémentant le compteur', () => {
    let c = initCursor(cats)
    let guard = 0
    while (currentTarget(c) && guard++ < 100) {
      c = advance(c, { hadItems: true, hasNext: false })
    }
    expect(c.done).toBe(true)
    expect(c.sweeps).toBe(0)
    const refreshed = openSweep(c, cats)
    expect(refreshed.sweeps).toBe(1)
    expect(refreshed.done).toBe(false)
    expect(currentTarget(refreshed)).toEqual({ categoryUrl: 'https://c.fr/1-a', page: 1 })
  })
  it('openSweep accepte un plan rafraîchi', () => {
    const c: HarvestCursor = { categories: cats, catIndex: 2, page: 1, sweeps: 0, done: true }
    const next = openSweep(c, ['https://c.fr/9-z'])
    expect(next.categories).toEqual(['https://c.fr/9-z'])
  })
})

describe('harvestProgress', () => {
  it('progresse avec les catégories parcourues', () => {
    expect(harvestProgress(initCursor(cats))).toBe(0)
    expect(harvestProgress({ categories: cats, catIndex: 1, page: 1, sweeps: 0, done: false })).toBe(0.5)
    expect(harvestProgress({ categories: cats, catIndex: 2, page: 1, sweeps: 0, done: true })).toBe(1)
  })
})

describe('pageDocId', () => {
  it('est stable et déterministe', () => {
    expect(pageDocId('https://c.fr/1-a', 2)).toBe(pageDocId('https://c.fr/1-a', 2))
  })
  it('diffère selon l’URL et la page', () => {
    expect(pageDocId('https://c.fr/1-a', 1)).not.toBe(pageDocId('https://c.fr/1-a', 2))
    expect(pageDocId('https://c.fr/1-a', 1)).not.toBe(pageDocId('https://c.fr/2-b', 1))
  })
  it('produit un identifiant Firestore valide', () => {
    expect(pageDocId('https://c.fr/1-a', 1)).toMatch(/^p_[a-z0-9]+$/)
  })
})
