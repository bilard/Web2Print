import { describe, it, expect } from 'vitest'
import {
  applyTargeting, applyTargetingBuckets, buildTargetingPrompt, familiesFromRows, pathOf,
  detectFamilyColumn,
} from './categoryTargeting'

const URLS = [
  'https://www.exemple.fr/produits/transmission/courroies-tondeuses/',
  'https://www.exemple.fr/produits/salle-de-bains/meuble-vasque/',
  'https://www.exemple.fr/produits/promotions/',
  'https://www.exemple.fr/produits/filtration/filtres-a-air/',
]

describe('buildTargetingPrompt', () => {
  it('numérote les CHEMINS (pas les URLs) et rappelle la consigne permissive', () => {
    const prompt = buildTargetingPrompt(['COURROIES', 'FILTRATION'], URLS)
    expect(prompt).toContain('0. /produits/transmission/courroies-tondeuses/')
    expect(prompt).toContain('- COURROIES')
    expect(prompt).not.toContain('https://')  // le domaine, répété 250 fois, est du bruit
    expect(prompt).toMatch(/EN CAS DE DOUTE, choisis "incertain"/)
  })
})

describe('pathOf', () => {
  it('rend l’URL telle quelle si elle est inanalysable', () => {
    expect(pathOf('pas-une-url')).toBe('pas-une-url')
  })
})

describe('applyTargetingBuckets', () => {
  it('garde pertinent PUIS incertain, écarte le hors-sujet', () => {
    const kept = applyTargetingBuckets({ pertinent: [0, 3], incertain: [2], horsSujet: [1] }, URLS)
    expect(kept).toEqual([URLS[0], URLS[3], URLS[2]])
  })

  it('ignore les index hors borne ou non entiers (réponse fantaisiste)', () => {
    const kept = applyTargetingBuckets({ pertinent: [0, 99, -1, 'x'], incertain: [] }, URLS)
    expect(kept).toEqual([URLS[0]])
  })

  it('ne vide JAMAIS un plan : tout écarté = null (l’appelant garde sa liste)', () => {
    expect(applyTargetingBuckets({ pertinent: [], incertain: [], horsSujet: [0, 1, 2, 3] }, URLS)).toBeNull()
    expect(applyTargetingBuckets({} as never, URLS)).toBeNull()
  })

  it('déduplique un index cité dans deux seaux', () => {
    expect(applyTargetingBuckets({ pertinent: [0], incertain: [0, 1] }, URLS)).toEqual([URLS[0], URLS[1]])
  })
})

describe('applyTargeting (réponse brute du modèle)', () => {
  it('accepte un JSON enrobé de balises markdown', () => {
    const raw = '```json\n{"pertinent":[0],"incertain":[],"horsSujet":[1,2,3]}\n```'
    expect(applyTargeting(raw, URLS)).toEqual([URLS[0]])
  })

  it('rend null sur une réponse illisible — fail-open côté appelant', () => {
    expect(applyTargeting('je ne sais pas', URLS)).toBeNull()
    expect(applyTargeting('{ ceci n’est pas du JSON', URLS)).toBeNull()
  })
})

describe('familiesFromRows', () => {
  const rows = [
    { Famille: 'COURROIES' }, { Famille: 'COURROIES' }, { Famille: 'COUPE' },
    { Famille: '  COURROIES  ' }, { Famille: '' }, { Famille: null }, {},
  ]

  it('déduplique, ignore les vides et trie par nombre de produits', () => {
    expect(familiesFromRows(rows, 'Famille')).toEqual(['COURROIES', 'COUPE'])
  })

  it('borne la liste (un prompt ne porte pas 500 familles)', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ Famille: `F${i}` }))
    expect(familiesFromRows(many, 'Famille', 10)).toHaveLength(10)
  })

  it('sans colonne configurée, ne devine rien', () => {
    expect(familiesFromRows(rows, '')).toEqual([])
  })
})

describe('⚠⚠ colonne de famille déduite quand elle n’est pas saisie', () => {
  it('trouve FAMILLE, et cible donc le scraping sans réglage manuel', () => {
    // La colonne est renseignée dans « Comparer catalogue », mais celui-là ne cible PAS le
    // scraping — son aide le dit. Le node « Moisson » a son propre champ, resté vide : le
    // filtre existait, l'écran l'annonçait, et la moisson balayait le catalogue entier de
    // chaque concurrent, rayons que la source ne vend pas compris.
    const rows = [{ REF: 'a', UNIVERS: 'JARDIN', FAMILLE: 'FILTRES', SOUS_FAMILLE: 'À AIR' }]
    expect(detectFamilyColumn(rows)).toBe('FAMILLE')
  })

  it('préfère la famille à l’univers, et ignore la sous-famille', () => {
    // « UNIVERS » regroupe des rayons entiers : trop large. « SOUS_FAMILLE » est trop fine —
    // les rayons d'un concurrent ne descendent pas à ce niveau et le filtre ne retiendrait
    // plus rien.
    expect(detectFamilyColumn([{ UNIVERS: 'x', SOUS_FAMILLE: 'y', FAMILLE: 'z' }])).toBe('FAMILLE')
    expect(detectFamilyColumn([{ UNIVERS: 'x', SOUS_FAMILLE: 'y' }])).toBe('UNIVERS')
  })

  it('reconnaît une colonne préfixée par un code interne', () => {
    expect(detectFamilyColumn([{ 'F1_Famille produit': 'FILTRES' }])).toBe('F1_Famille produit')
  })

  it('rend vide si rien ne correspond — comportement strictement inchangé', () => {
    expect(detectFamilyColumn([{ REF: 'a', LIBELLE: 'b' }])).toBe('')
    expect(detectFamilyColumn([])).toBe('')
  })
})
