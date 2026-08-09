import { describe, it, expect } from 'vitest'
import { reviseQueue, changedFields } from './staleRevision'
import type { SourceProduct } from '../catalog/match'
import type { TextRevision } from '../textRevisionsStore'

const p = (over: Partial<SourceProduct>): SourceProduct => ({ id: 'x', name: '', ...over })
const rev = (over: Partial<TextRevision>): TextRevision => ({ productId: 'x', at: 0, ...over })

describe('péremption d’une réécriture', () => {
  it('rien n’a bougé : la fiche reste faite', () => {
    const prod = p({ id: '1', name: 'BOBINEAU', description: 'Bobineau adaptable FLYMO' })
    expect(changedFields(prod, rev({ nameSource: 'BOBINEAU', descriptionSource: 'Bobineau adaptable FLYMO' })))
      .toEqual([])
  })

  it('le fournisseur a corrigé le texte de vente : la fiche est périmée', () => {
    const prod = p({ id: '1', name: 'BOBINEAU', description: 'Bobineau adaptable FLYMO et Mc CULLOCH' })
    expect(changedFields(prod, rev({ nameSource: 'BOBINEAU', descriptionSource: 'Bobineau adaptable FLYMO' })))
      .toEqual(['description'])
  })

  it('⚠ une description APPARUE depuis compte comme matière neuve', () => {
    // Sans ça, une fiche traduite quand elle n'avait qu'un libellé garderait à jamais son
    // texte de vente d'origine, en allemand.
    const prod = p({ id: '1', name: 'ATTACHE', description: 'Neue Beschreibung' })
    expect(changedFields(prod, rev({ nameSource: 'ATTACHE' }))).toEqual(['description'])
  })

  it('ni original mémorisé ni texte au catalogue : rien à reprendre', () => {
    expect(changedFields(p({ id: '1', name: 'ATTACHE' }), rev({ nameSource: 'ATTACHE' }))).toEqual([])
  })

  it('espaces et casse ne font PAS une modification', () => {
    // Un export qui recapitalise relancerait sinon tout le catalogue, et le referait payer.
    const prod = p({ id: '1', name: '  Bobineau  ', description: 'TEXTE DE VENTE' })
    expect(changedFields(prod, rev({ nameSource: 'bobineau', descriptionSource: 'texte de vente' })))
      .toEqual([])
  })
})

describe('file d’un passage', () => {
  const CATALOG: SourceProduct[] = [
    p({ id: 'neuf', name: 'Neuf' }),
    p({ id: 'fait', name: 'Fait', description: 'inchangé' }),
    p({ id: 'perime', name: 'Périmé', description: 'nouveau texte' }),
  ]
  const REVS = new Map<string, TextRevision>([
    ['fait', rev({ productId: 'fait', nameSource: 'Fait', descriptionSource: 'inchangé' })],
    ['perime', rev({ productId: 'perime', nameSource: 'Périmé', descriptionSource: 'ancien texte' })],
  ])

  it('prend les neuves et les périmées, jamais celles qui sont à jour', () => {
    const q = reviseQueue(CATALOG, REVS, { refreshStale: true })
    expect(q.map((t) => [t.product.id, t.reason])).toEqual([['neuf', 'new'], ['perime', 'stale']])
    expect(q[1].changed).toEqual(['description'])
  })

  it('⚠ les NEUVES d’abord : une file plafonnée ne doit pas les faire attendre', () => {
    const many = [...Array(3)].map((_, i) => p({ id: `p${i}`, name: 'Périmé', description: 'neuf' }))
    const revs = new Map(many.map((m) => [m.id, rev({ productId: m.id, nameSource: 'Périmé', descriptionSource: 'vieux' })]))
    revs.set('zz', rev({ productId: 'zz' }))
    const q = reviseQueue([...many, p({ id: 'arrive', name: 'Arrivé ce matin' })], revs, { refreshStale: true })
    expect(q[0].product.id).toBe('arrive')
  })

  it('sans reprise des périmées, seules les neuves entrent', () => {
    expect(reviseQueue(CATALOG, REVS, { refreshStale: false }).map((t) => t.product.id)).toEqual(['neuf'])
  })

  it('le filtre d’acceptation s’applique AVANT tout le reste', () => {
    const q = reviseQueue(CATALOG, REVS, { refreshStale: true, accept: (x) => x.id !== 'neuf' })
    expect(q.map((t) => t.product.id)).toEqual(['perime'])
  })
})
