// src/features/priceWatch/catalog/categories.test.ts
import { describe, it, expect } from 'vitest'
import {
  foldText, keywordsForFamilies, extractCategoryLinks, selectCategories,
} from './categories'

describe('foldText', () => {
  it('retire accents et casse', () => {
    expect(foldText('Filtration Électrique')).toBe('filtration electrique')
  })
})

describe('keywordsForFamilies', () => {
  it('mappe les familles connues, ignore les inconnues', () => {
    const kw = keywordsForFamilies(['COURROIES', 'FAMILLE INCONNUE'])
    expect(kw).toContain('courroie')
    expect(kw).not.toContain(undefined)
  })
  it('est insensible à la casse et aux espaces', () => {
    expect(keywordsForFamilies([' courroies '])).toContain('courroie')
  })
})

describe('extractCategoryLinks', () => {
  const base = 'https://www.c.fr/'
  const html = `
    <a href="https://www.c.fr/812-courroies">Courroies</a>
    <a href="https://www.c.fr/661-lames-tondeuse">Lames</a>
    <a href="https://www.c.fr/14087-alternateur-briggs.html">Produit</a>
    <a href="https://autre.fr/99-hors-domaine">Externe</a>
    <a href="https://www.c.fr/812-courroies">Doublon</a>`

  it('extrait les liens catégorie du host', () => {
    const links = extractCategoryLinks(html, base)
    expect(links.map((l) => l.slug)).toEqual(['courroies', 'lames-tondeuse'])
  })
  it('exclut les fiches produit (.html)', () => {
    expect(extractCategoryLinks(html, base).some((l) => l.url.endsWith('.html'))).toBe(false)
  })
  it('exclut les autres domaines', () => {
    expect(extractCategoryLinks(html, base).some((l) => l.url.includes('autre.fr'))).toBe(false)
  })
  it('déduplique', () => {
    expect(extractCategoryLinks(html, base).filter((l) => l.slug === 'courroies')).toHaveLength(1)
  })
})

describe('selectCategories', () => {
  const links = [
    { url: 'https://c.fr/1-courroies', slug: 'courroies' },
    { url: 'https://c.fr/2-filtres-a-air', slug: 'filtres-a-air' },
    { url: 'https://c.fr/3-visserie', slug: 'visserie' },
  ]
  it('garde les catégories dont le slug contient un mot-clé', () => {
    expect(selectCategories(links, ['courroie', 'filtre'])).toEqual([
      'https://c.fr/1-courroies', 'https://c.fr/2-filtres-a-air',
    ])
  })
  it('rend TOUTES les catégories sans mot-clé (catalogue complet)', () => {
    expect(selectCategories(links, [])).toHaveLength(3)
  })
  it('rend vide si aucun slug ne matche', () => {
    expect(selectCategories(links, ['carburateur'])).toEqual([])
  })
})
