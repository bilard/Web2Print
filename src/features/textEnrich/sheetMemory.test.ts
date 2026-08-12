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

describe('⚠⚠ la carte ne doit pas retraiter son PROPRE travail', () => {
  // Cas VÉCU le 2026-08-12 : 206 353 champs remis en file alors que tout avait été traité
  // la veille. La feuille portait désormais la traduction ; la mémoire ne connaissait que
  // l'original, déclarait « changé par la source », et le modèle retraduisait ce qu'il
  // venait de traduire — à chaque cycle, indéfiniment.
  const cols = { ref: 'REF' }
  const row = (text: string) => ({ REF: 'A1', TEXT_VENTE: text })

  it('reconnaît le texte qu’elle a produit', () => {
    const before = row('Left blade, right rotation')
    const memory = rememberRows({}, [{ row: before, key: 'A1', reason: 'new', fields: ['TEXT_VENTE'] }],
      cols, new Map([['A1|TEXT_VENTE', 'Lame gauche, rotation à droite']]))
    // La feuille porte maintenant la traduction : rien ne doit repartir.
    expect(sheetQueue([row('Lame gauche, rotation à droite')], ['TEXT_VENTE'], memory, cols)).toEqual([])
    // Et l'original reste reconnu, au cas où la feuille n'aurait pas été réécrite.
    expect(sheetQueue([before], ['TEXT_VENTE'], memory, cols)).toEqual([])
  })

  it('reprend bien un texte VRAIMENT changé par la source', () => {
    const memory = rememberRows({}, [{ row: row('Ancien'), key: 'A1', reason: 'new', fields: ['TEXT_VENTE'] }],
      cols, new Map([['A1|TEXT_VENTE', 'Traduit']]))
    expect(sheetQueue([row('Texte tout neuf du fournisseur')], ['TEXT_VENTE'], memory, cols))
      .toHaveLength(1)
  })

  it('lit encore une mémoire écrite AVANT ce changement', () => {
    const legacy = rememberRows({}, [{ row: row('Original'), key: 'A1', reason: 'new', fields: ['TEXT_VENTE'] }], cols)
    expect(sheetQueue([row('Original')], ['TEXT_VENTE'], legacy, cols)).toEqual([])
  })
})

describe('⚠⚠ rattrapage : la colonne « (source) » vaut preuve de traitement', () => {
  // Sans lui, une mémoire écrite AVANT que le texte produit ne soit retenu ferait repayer
  // tout le catalogue une dernière fois — 206 353 champs, des milliers de jetons — alors
  // que la feuille porte déjà, à côté, l'original que cette mémoire connaît.
  const cols = { ref: 'REF' }

  it('reconnaît un champ traduit dont l’original est resté dans la colonne jumelle', () => {
    const legacy = rememberRows({}, [{
      row: { REF: 'A1', TEXT_VENTE: 'Left blade, right rotation' },
      key: 'A1', reason: 'new', fields: ['TEXT_VENTE'],
    }], cols)
    const rewritten = {
      REF: 'A1',
      TEXT_VENTE: 'Lame gauche, rotation à droite',
      'TEXT_VENTE (source)': 'Left blade, right rotation',
    }
    expect(sheetQueue([rewritten], ['TEXT_VENTE'], legacy, cols)).toEqual([])
  })

  it('reprend quand la colonne jumelle porte un AUTRE original', () => {
    const legacy = rememberRows({}, [{
      row: { REF: 'A1', TEXT_VENTE: 'Ancien texte' }, key: 'A1', reason: 'new', fields: ['TEXT_VENTE'],
    }], cols)
    const changedAtSource = {
      REF: 'A1', TEXT_VENTE: 'Traduction', 'TEXT_VENTE (source)': 'Texte tout neuf du fournisseur',
    }
    expect(sheetQueue([changedAtSource], ['TEXT_VENTE'], legacy, cols)).toHaveLength(1)
  })
})
