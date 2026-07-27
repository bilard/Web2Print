import { describe, expect, it } from 'vitest'
import { stripUndefined } from '@/lib/stripUndefined'

describe('stripUndefined', () => {
  it('retire les clés undefined au premier niveau (fieldMap « (non mappé) »)', () => {
    expect(stripUndefined({ name: undefined, brand: 'Marques' })).toEqual({ brand: 'Marques' })
  })

  it('retire les undefined imbriqués (config.styles.fontWeight remis par défaut)', () => {
    const config = { styles: { name: { fontWeight: undefined, fontSize: 42 } }, accent: '#EF4444' }
    expect(stripUndefined(config)).toEqual({ styles: { name: { fontSize: 42 } }, accent: '#EF4444' })
  })

  it('préserve null, 0, false et les chaînes vides', () => {
    expect(stripUndefined({ a: null, b: 0, c: false, d: '' })).toEqual({ a: null, b: 0, c: false, d: '' })
  })

  it('traverse les tableaux sans les casser', () => {
    expect(stripUndefined({ rules: [{ op: 'eq', v: undefined }, { op: 'gt' }] }))
      .toEqual({ rules: [{ op: 'eq' }, { op: 'gt' }] })
  })

  it('renvoie les scalaires tels quels', () => {
    expect(stripUndefined('x')).toBe('x')
    expect(stripUndefined(null)).toBeNull()
  })
})

describe('catalogue source de la Veille tarifaire (régression F1 Pro)', () => {
  // Forme RÉELLE produite par le node « Comparer catalogue » : les champs facultatifs
  // sont posés EXPLICITEMENT à `undefined` quand la colonne n'est pas mappée ou que la
  // cellule n'est pas un nombre. Firestore refusait le doc ENTIER — « Unsupported field
  // value: undefined » — donc le catalogue source n'était jamais persisté côté client.
  const products = [
    { id: 'a', name: 'Courroie A97', ref: 'A97', ref2: undefined, ean: undefined, originRefs: [], price: 24.9 },
    { id: 'b', name: 'Lame 45 cm', ref: undefined, ref2: undefined, ean: undefined, originRefs: [], price: undefined },
  ]

  it('aucune valeur undefined ne subsiste dans la charge écrite', () => {
    const json = JSON.stringify(stripUndefined(products))
    expect(Object.values(stripUndefined(products)[1])).not.toContain(undefined)
    expect(json).not.toContain('null') // rien n'est converti en null au passage
  })

  it('conserve intégralement les champs renseignés', () => {
    expect(stripUndefined(products)[0]).toEqual({
      id: 'a', name: 'Courroie A97', ref: 'A97', originRefs: [], price: 24.9,
    })
  })

  it('un produit sans aucune clé reste une entrée valide (id + nom)', () => {
    expect(stripUndefined(products)[1]).toEqual({ id: 'b', name: 'Lame 45 cm', originRefs: [] })
  })
})
