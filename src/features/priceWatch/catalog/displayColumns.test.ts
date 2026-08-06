import { describe, it, expect } from 'vitest'
import { pickDisplayColumns, taxoPathOf, trimDescription, DESCRIPTION_MAX } from './displayColumns'

const H = (...keys: string[]) => keys.map((key) => ({ key }))

describe('pickDisplayColumns', () => {
  it('reconnaît les en-têtes du catalogue F1', () => {
    const d = pickDisplayColumns(H('CODE_ARTICLE', 'DESCRIPTIF', 'PATH_PHOTO', 'FAMILLE', 'WEBGROUP_DESC', 'PRODUCTGROUP'))
    expect(d).toEqual({
      description: 'DESCRIPTIF', image: 'PATH_PHOTO',
      taxo: ['FAMILLE', 'WEBGROUP_DESC', 'PRODUCTGROUP'],
    })
  })

  it('ne confond pas famille et sous-famille, quel que soit l’ordre des colonnes', () => {
    expect(pickDisplayColumns(H('WEBGROUP_DESC', 'FAMILLE')).taxo).toEqual(['FAMILLE', 'WEBGROUP_DESC'])
  })

  it('n’attribue jamais deux niveaux à la même colonne', () => {
    const taxo = pickDisplayColumns(H('Famille')).taxo
    expect(taxo).toEqual(['Famille'])
  })

  it('respecte la colonne de description configurée dans le node', () => {
    const cols = H('DESCRIPTIF', 'COMMENTAIRE')
    expect(pickDisplayColumns(cols, { description: 'COMMENTAIRE' }).description).toBe('COMMENTAIRE')
    // Une configuration qui pointe dans le vide ne bloque pas le devinage.
    expect(pickDisplayColumns(cols, { description: 'ABSENTE' }).description).toBe('DESCRIPTIF')
  })

  it('cherche aussi dans le LIBELLÉ de colonne, pas seulement dans la clé', () => {
    const d = pickDisplayColumns([{ key: 'C1', label: 'Visuel produit' }, { key: 'C2', label: 'Famille' }])
    expect(d.image).toBe('C1')
    expect(d.taxo).toEqual(['C2'])
  })

  it('ne renvoie rien plutôt que d’inventer sur une feuille sans ces colonnes', () => {
    expect(pickDisplayColumns(H('REF', 'PRIX'))).toEqual({ taxo: [] })
  })
})

describe('taxoPathOf', () => {
  it('s’arrête au premier niveau vide', () => {
    const row = { A: 'Motoculture', B: '', C: 'Courroies' }
    expect(taxoPathOf(row, ['A', 'B', 'C'])).toEqual(['Motoculture'])
  })
  it('ignore les espaces et les cellules absentes', () => {
    expect(taxoPathOf({ A: '  Jardin  ' }, ['A', 'B'])).toEqual(['Jardin'])
  })
})

describe('trimDescription', () => {
  it('tronque au-delà du plafond persistable', () => {
    const long = 'x'.repeat(DESCRIPTION_MAX + 50)
    expect(trimDescription(long)).toHaveLength(DESCRIPTION_MAX + 1)
    expect(trimDescription(long)?.endsWith('…')).toBe(true)
  })
  it('rend undefined sur une cellule vide (jamais une chaîne vide en base)', () => {
    expect(trimDescription('   ')).toBeUndefined()
    expect(trimDescription(null)).toBeUndefined()
  })
})

describe('colonne TEXT_VENTE', () => {
  it('retient le texte de vente PLUTÔT que la colonne « DESCRIPTION »', () => {
    // Cas VÉCU sur le catalogue F1 : « DESCRIPTION » recopie le libellé, « TEXT_VENTE »
    // porte l'argumentaire. Retenir la première affichait le nom deux fois de suite.
    const cols = [
      { key: 'LIBELLE', label: 'Désignation' },
      { key: 'DESCRIPTION', label: 'Description' },
      { key: 'TEXT_VENTE', label: 'Texte de vente' },
    ]
    expect(pickDisplayColumns(cols).description).toBe('TEXT_VENTE')
  })

  it('reconnaît les écritures usuelles du texte de vente', () => {
    for (const key of ['TEXT_VENTE', 'TEXTE_VENTE', 'Texte de vente', 'texteVenteWeb']) {
      expect(pickDisplayColumns([{ key }]).description).toBe(key)
    }
  })

  it('ne change RIEN sur une feuille sans texte de vente', () => {
    const cols = [{ key: 'LIBELLE' }, { key: 'DESCRIPTIF' }]
    expect(pickDisplayColumns(cols).description).toBe('DESCRIPTIF')
  })

  it('la colonne saisie dans le node prime toujours sur la détection', () => {
    const cols = [{ key: 'DESCRIPTION' }, { key: 'TEXT_VENTE' }]
    expect(pickDisplayColumns(cols, { description: 'DESCRIPTION' }).description).toBe('DESCRIPTION')
  })
})
