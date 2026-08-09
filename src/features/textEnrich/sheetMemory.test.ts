import { describe, it, expect } from 'vitest'
import { sheetQueue, rememberRows, memoryKey, textFingerprint, type EnrichMemory } from './sheetMemory'

const COLS = { ref: 'ARTICLECODE', ean: 'EAN' }
const row = (ref: string, desc: string, txt = '') =>
  ({ _id: 'row_0', ARTICLECODE: ref, DESCRIPTION: desc, TEXT_VENTE: txt })
const FIELDS = ['DESCRIPTION', 'TEXT_VENTE']

describe('clé de mémoire', () => {
  it('⚠ c’est la RÉFÉRENCE, jamais le numéro de ligne', () => {
    // Les lignes sont numérotées par POSITION : une insertion chez le fournisseur les
    // décale toutes, et la mémoire ne reconnaîtrait plus rien.
    expect(memoryKey({ _id: 'row_42', ARTICLECODE: 'FL9225' }, COLS)).toBe('FL9225')
  })

  it('retombe sur le code-barres quand la référence manque', () => {
    expect(memoryKey({ ARTICLECODE: '  ', EAN: '3582329400510' }, COLS)).toBe('3582329400510')
  })

  it('sans clé reconnaissable, aucune mémoire — la ligne repassera', () => {
    expect(memoryKey({ ARTICLECODE: '' }, COLS)).toBeNull()
  })
})

describe('empreinte', () => {
  it('ignore casse et espaces : un export recapitalisé ne relance pas le catalogue', () => {
    expect(textFingerprint('  Bobineau FLYMO ')).toBe(textFingerprint('bobineau flymo'))
  })

  it('change dès que le texte change', () => {
    expect(textFingerprint('Bobineau FLYMO')).not.toBe(textFingerprint('Bobineau FLYMO et Mc CULLOCH'))
  })

  it('vide et absent sont la même chose', () => {
    expect(textFingerprint(null)).toBe(textFingerprint(''))
  })
})

describe('file d’un passage sur feuille', () => {
  const memory: EnrichMemory = {
    FAIT: { DESCRIPTION: textFingerprint('Lame'), TEXT_VENTE: textFingerprint('Texte') },
  }

  it('prend les lignes jamais vues', () => {
    const q = sheetQueue([row('NEUF', 'Lame')], FIELDS, memory, COLS)
    expect(q).toHaveLength(1)
    expect(q[0].reason).toBe('new')
    expect(q[0].fields).toEqual(FIELDS)
  })

  it('laisse tranquille ce qui n’a pas bougé', () => {
    expect(sheetQueue([row('FAIT', 'Lame', 'Texte')], FIELDS, memory, COLS)).toEqual([])
  })

  it('⚠ ne reprend QUE le champ modifié : l’autre a déjà été payé', () => {
    const q = sheetQueue([row('FAIT', 'Lame', 'Nouveau texte')], FIELDS, memory, COLS)
    expect(q).toHaveLength(1)
    expect(q[0].reason).toBe('changed')
    expect(q[0].fields).toEqual(['TEXT_VENTE'])
  })

  it('une ligne sans clé repasse à chaque fois, faute de pouvoir la reconnaître', () => {
    const q = sheetQueue([{ ARTICLECODE: '', DESCRIPTION: 'x' }], FIELDS, memory, COLS)
    expect(q[0].reason).toBe('unknown-key')
  })
})

describe('mise à jour de la mémoire', () => {
  it('⚠ FUSIONNE : un passage borné n’efface pas ce que les précédents savaient', () => {
    const before: EnrichMemory = { AUTRE: { DESCRIPTION: 'x' } }
    const after = rememberRows(before, sheetQueue([row('NEUF', 'Lame')], FIELDS, before, COLS), COLS)
    expect(after.AUTRE).toEqual({ DESCRIPTION: 'x' })
    expect(after.NEUF.DESCRIPTION).toBe(textFingerprint('Lame'))
  })

  it('n’écrit que les champs traités : le reste de la ligne garde sa mémoire', () => {
    const before: EnrichMemory = { P: { DESCRIPTION: 'ancien', TEXT_VENTE: 'garde-moi' } }
    const q = sheetQueue([row('P', 'Nouvelle lame', 'x')], FIELDS, before, COLS)
    const after = rememberRows(before, q, COLS)
    expect(after.P.DESCRIPTION).toBe(textFingerprint('Nouvelle lame'))
    expect(after.P.TEXT_VENTE).toBe(textFingerprint('x'))
  })

  it('une ligne sans clé ne laisse aucune trace', () => {
    const after = rememberRows({}, [{ row: { ARTICLECODE: '' }, key: null, reason: 'unknown-key', fields: FIELDS }], COLS)
    expect(after).toEqual({})
  })
})
