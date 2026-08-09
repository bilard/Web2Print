import { describe, it, expect } from 'vitest'
import { buildPublishedRevisions, type RevisionEvent } from './publishRevisions'

const COLS = { ref: 'ARTICLECODE', ean: 'EAN13' }

function ev(over: Partial<RevisionEvent> & { row: Record<string, unknown> }): RevisionEvent {
  return { field: 'TEXT_VENTE', kind: 'translate', before: 'avant', after: 'après', ...over }
}

describe('buildPublishedRevisions', () => {
  it('clefe sur la référence article', () => {
    const out = buildPublishedRevisions([ev({ row: { ARTICLECODE: 'A-100' } })], COLS, 7)
    expect(out).toEqual([{
      key: 'A-100',
      byColumn: { TEXT_VENTE: { before: 'avant', after: 'après' } },
      ops: { translate: true },
      at: 7,
    }])
  })

  it('retombe sur le code-barres quand la référence manque', () => {
    const out = buildPublishedRevisions([ev({ row: { ARTICLECODE: '', EAN13: '3660001' } })], COLS, 1)
    expect(out[0].key).toBe('3660001')
  })

  it('écarte une ligne que rien ne permet de reconnaître', () => {
    expect(buildPublishedRevisions([ev({ row: { NOM: 'Courroie' } })], COLS, 1)).toEqual([])
  })

  it('regroupe toutes les colonnes d’un même produit', () => {
    const row = { ARTICLECODE: 'A-100' }
    const out = buildPublishedRevisions([
      ev({ row, field: 'DESIGNATION', before: 'Riemen', after: 'Courroie' }),
      ev({ row, field: 'TEXT_VENTE', before: 'Passend für…', after: 'Compatible avec…' }),
    ], COLS, 1)
    expect(out).toHaveLength(1)
    expect(Object.keys(out[0].byColumn)).toEqual(['DESIGNATION', 'TEXT_VENTE'])
  })

  // ⚠ Le cas qui décide de tout : traduire puis améliorer une même colonne. Garder
  // l'avant de la SECONDE vague afficherait la traduction comme texte d'origine, et
  // l'allemand — ce qu'on veut précisément relire — aurait disparu de la comparaison.
  it('garde l’avant de la PREMIÈRE vague et l’après de la dernière', () => {
    const row = { ARTICLECODE: 'A-100' }
    const out = buildPublishedRevisions([
      ev({ row, before: 'Keilriemen', after: 'Courroie trapézoïdale', kind: 'translate' }),
      ev({ row, before: 'Courroie trapézoïdale', after: 'Courroie trapézoïdale — profil A', kind: 'improve' }),
    ], COLS, 1)
    expect(out[0].byColumn.TEXT_VENTE).toEqual({
      before: 'Keilriemen', after: 'Courroie trapézoïdale — profil A',
    })
    expect(out[0].ops).toEqual({ translate: true, improve: true })
  })

  it('range toute nature autre que la traduction en « amélioré »', () => {
    const out = buildPublishedRevisions([ev({ row: { ARTICLECODE: 'A' }, kind: 'structure' })], COLS, 1)
    expect(out[0].ops).toEqual({ improve: true })
  })

  it('n’écrit une note que lorsqu’il y en a une (Firestore refuse `undefined`)', () => {
    const plain = buildPublishedRevisions([ev({ row: { ARTICLECODE: 'A' } })], COLS, 1)
    expect('note' in plain[0].byColumn.TEXT_VENTE).toBe(false)
    const noted = buildPublishedRevisions([ev({ row: { ARTICLECODE: 'A' }, note: 'traduit de l’allemand' })], COLS, 1)
    expect(noted[0].byColumn.TEXT_VENTE.note).toBe('traduit de l’allemand')
  })
})
