import { describe, it, expect } from 'vitest'
import { resolveCompareColumns, hasNoJoinKey, foldHeader } from './compareColumns'

/** Feuille dont les en-têtes ne ressemblent PAS aux valeurs par défaut du node. */
const REAL = [
  { key: 'Référence article', label: 'Référence article' },
  { key: 'Code EAN', label: 'Code EAN' },
  { key: 'Désignation', label: 'Désignation' },
  { key: 'Famille', label: 'Famille' },
  { key: 'Prix de vente HT (€)', label: 'Prix de vente HT (€)' },
  { key: 'Descriptif', label: 'Descriptif' },
]
/** Ce que le node porte par défaut — jamais vide, donc jamais « à deviner ». */
const DEFAULTS = {
  ref: 'reference', ref2: '', ean: 'ean', name: 'name',
  family: 'family', price: 'price', description: 'description', url: '',
}

describe('resolveCompareColumns', () => {
  it('rattrape des défauts qui ne pointent sur RIEN (la panne silencieuse)', () => {
    const r = resolveCompareColumns(REAL, DEFAULTS)
    expect(r.columns.ref).toBe('Référence article')
    expect(r.columns.ean).toBe('Code EAN')
    expect(r.columns.name).toBe('Désignation')
    expect(r.columns.price).toBe('Prix de vente HT (€)')
    expect(r.guessed).toEqual(expect.arrayContaining(['ref', 'ean', 'name', 'price']))
  })

  it('un choix explicite VALIDE prime — on ne devine jamais par-dessus', () => {
    const cols = [{ key: 'Ref fournisseur' }, { key: 'Référence article' }]
    const r = resolveCompareColumns(cols, { ...DEFAULTS, ref: 'Ref fournisseur' })
    expect(r.columns.ref).toBe('Ref fournisseur')
    expect(r.guessed).not.toContain('ref')
  })

  it('égalité stricte AVANT inclusion : « Prix » ne se fait pas voler par « Prix barré »', () => {
    const cols = [{ key: 'Prix barré' }, { key: 'Prix' }]
    expect(resolveCompareColumns(cols, DEFAULTS).columns.price).toBe('Prix')
  })

  it('reconnaît via le LIBELLÉ quand la clé est technique', () => {
    const cols = [{ key: 'col_7', label: 'Référence' }, { key: 'col_9', label: 'Prix HT' }]
    const r = resolveCompareColumns(cols, DEFAULTS)
    expect(r.columns.ref).toBe('col_7')   // la CLÉ est rendue, pas le libellé
    expect(r.columns.price).toBe('col_9')
  })

  it('signale ce qui reste introuvable au lieu de le taire', () => {
    const r = resolveCompareColumns([{ key: 'Référence article' }], DEFAULTS)
    expect(r.missing).toEqual(expect.arrayContaining(['ean', 'name', 'price']))
    expect(r.columns.ref).toBe('Référence article')
  })

  it('ne réclame rien pour un champ laissé vide et absent (ref2, url)', () => {
    const r = resolveCompareColumns([{ key: 'Référence article' }], DEFAULTS)
    expect(r.missing).not.toContain('ref2')
    expect(r.missing).not.toContain('url')
  })

  it('ref2 ne capte pas la référence principale', () => {
    const r = resolveCompareColumns(REAL, DEFAULTS)
    expect(r.columns.ref2).toBeUndefined()
  })
})

describe('hasNoJoinKey — refuser de comparer du vide', () => {
  it('vrai quand la feuille n’offre ni référence ni EAN', () => {
    const r = resolveCompareColumns([{ key: 'Désignation' }, { key: 'Prix' }], DEFAULTS)
    expect(hasNoJoinKey(r)).toBe(true)
  })

  it('faux dès qu’UNE clé existe', () => {
    expect(hasNoJoinKey(resolveCompareColumns([{ key: 'Code EAN' }], DEFAULTS))).toBe(false)
  })
})

describe('foldHeader', () => {
  it('ignore accents, casse, espaces et ponctuation', () => {
    expect(foldHeader('Prix de vente HT (€)')).toBe('prixdeventeht')
    expect(foldHeader('Réf. Article')).toBe('refarticle')
  })
})
