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
  it('gère le préfixe de locale (/fr/…) — matijardin', () => {
    const links = extractCategoryLinks('<a href="https://www.m.fr/fr/950-promos">P</a>', 'https://www.m.fr/')
    expect(links.map((l) => l.slug)).toEqual(['promos'])
  })
  it('apparie malgré www/http différents entre domaine configuré et liens — 123courroies', () => {
    const h = '<a href="http://www.c.fr/5-toutes-nos-courroies">A</a><a href="/34-courroie-crantee">B</a>'
    // Domaine configuré SANS www ; liens en www/http et relatif → tout doit apparier.
    const links = extractCategoryLinks(h, 'http://c.fr/')
    expect(links.map((l) => l.slug).sort()).toEqual(['courroie-crantee', 'toutes-nos-courroies'])
  })
  it('exclut les pages CMS (/content/…) et les assets', () => {
    const h = '<a href="https://www.c.fr/fr/content/33-qui-sommes-nous">CMS</a><a href="https://www.c.fr/modules/x/grid-1-7-module.css">CSS</a>'
    expect(extractCategoryLinks(h, 'https://www.c.fr/')).toHaveLength(0)
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

describe('keywordsForFamilies — familles hors dictionnaire', () => {
  it('dérive les mots-clés du libellé (plus aucune famille ignorée en silence)', () => {
    expect(keywordsForFamilies(['CYLINDRES, PISTONS, BIELLES ET SEGMENTS']))
      .toEqual(expect.arrayContaining(['cylindre', 'piston', 'bielle', 'segment']))
    expect(keywordsForFamilies(['JOINTS'])).toContain('joint')
  })

  it('ne rend JAMAIS une liste vide pour une famille nommée', () => {
    // Vide = « aucun filtre » côté moisson : la famille inconnue faisait balayer TOUT.
    for (const fam of ['PIECES ORIGINE', 'CHASSIS ET PIECES MECANIQUES', 'ROULEMENTS, PNEUMATIQUES ET CHAMBRES A AIR']) {
      expect(keywordsForFamilies([fam]).length).toBeGreaterThan(0)
    }
  })

  it('garde les synonymes du dictionnaire pour les familles connues', () => {
    const kw = keywordsForFamilies(['COUPE'])
    expect(kw).toContain('lame')       // synonyme métier
    expect(kw).toContain('coupe')      // mot du libellé
  })

  it('ignore les mots grammaticaux et les mots trop courts', () => {
    expect(keywordsForFamilies(['PIECES ET ACCESSOIRES'])).not.toContain('et')
  })
})
