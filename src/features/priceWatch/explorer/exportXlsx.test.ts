import { describe, it, expect } from 'vitest'
import { rowsToSheetMatrix, XLSX_HEAD } from './exportXlsx'
import type { PairedRow } from './pairing'
import type { Confidence } from './confidence'

const conf = (over: Partial<Confidence> = {}): Confidence =>
  ({ score: 62, band: 'check', doubts: [], supports: [], raw: { core: 62, bonus: 0 }, ...over })

const row = (over: Partial<PairedRow> = {}): PairedRow => ({
  key: 'https://c.fr/p',
  listing: { url: 'https://c.fr/p', name: 'Courroie de coupe AB-12X', ref: 'AB12X', price: 108 },
  cmp: { priceHt: 90, priceTtc: 108, listPriceTtc: undefined, deltaPct: -10 },
  source: {
    id: 'p1', ref: 'AB-12X', ean: '4049582395377', name: 'COURROIE', description: null,
    images: [], priceHt: 100, url: null, path: [],
  },
  kind: 'exact-ref',
  proof: { evidence: 'ref-in-title', keyValue: 'AB12X', isEan: false },
  confidence: conf(),
  ...over,
})

const ctx = { domainOf: () => 'jardimax.com' }

describe('rowsToSheetMatrix', () => {
  it('écrit l’en-tête, puis une ligne par appariement', () => {
    const m = rowsToSheetMatrix([row()], ctx)
    expect(m[0]).toEqual([...XLSX_HEAD])
    expect(m).toHaveLength(2)
    expect(m[1].length).toBe(XLSX_HEAD.length)
    expect(m[1][0]).toBe('jardimax.com')
  })

  it('garde les prix et l’écart en NOMBRES — c’est toute la raison du classeur', () => {
    // En CSV le tableur reçoit « -10 » comme texte : ni tri, ni somme, ni moyenne.
    const m = rowsToSheetMatrix([row()], ctx)
    const cell = (name: string) => m[1][XLSX_HEAD.indexOf(name)]
    expect(cell('Prix HT')).toBe(90)
    expect(cell('Mon prix HT')).toBe(100)
    expect(cell('Écart %')).toBe(-10)
    expect(cell('Score')).toBe(62)
  })

  it('laisse la case VIDE quand la valeur manque, jamais un zéro', () => {
    // Un 0 dans « Prix HT » fausserait toute moyenne calculée dans le tableur.
    const m = rowsToSheetMatrix(
      [row({ cmp: { priceHt: undefined, priceTtc: undefined, listPriceTtc: undefined, deltaPct: undefined } })], ctx,
    )
    expect(m[1][XLSX_HEAD.indexOf('Prix HT')]).toBeNull()
    expect(m[1][XLSX_HEAD.indexOf('Écart %')]).toBeNull()
  })

  it('traduit la bande, les motifs de doute et la preuve', () => {
    const m = rowsToSheetMatrix(
      [row({ confidence: conf({ band: 'doubt', doubts: ['numeric-short', 'family-conflict'] }) })], ctx,
    )
    expect(m[1][XLSX_HEAD.indexOf('Fiabilité')]).toBe('Douteux')
    expect(m[1][XLSX_HEAD.indexOf('Motifs de doute')])
      .toBe('clé numérique courte, natures de pièces incompatibles')
    expect(m[1][XLSX_HEAD.indexOf('Preuve')]).toBe('référence dans le libellé')
  })

  it('porte le verdict déjà rendu — sans lui, l’export refait juger ce qui l’a été', () => {
    const m = rowsToSheetMatrix([row()], { ...ctx, verdictOf: () => 'ok' })
    expect(m[1][XLSX_HEAD.indexOf('Verdict')]).toBe('Validé')
    expect(rowsToSheetMatrix([row()], ctx)[1][XLSX_HEAD.indexOf('Verdict')]).toBeNull()
  })

  it('accepte une fiche orpheline sans planter', () => {
    const m = rowsToSheetMatrix([row({ source: null, confidence: null, proof: null, kind: null })], ctx)
    expect(m[1][XLSX_HEAD.indexOf('Ma référence')]).toBeNull()
    expect(m[1][XLSX_HEAD.indexOf('Titre concurrent')]).toBe('Courroie de coupe AB-12X')
  })
})
