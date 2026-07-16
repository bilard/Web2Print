import { describe, it, expect } from 'vitest'
import type { ExcelColumn, ExcelRow } from '@/features/excel/types'
import type { EnrichedProduct } from '@/features/excel/ai-enrichment/types'
import { sheetRowToEnrichedProduct, compareSourceVsManufacturer, summarize, buildRowComparison } from './compareProducts'

const col = (key: string): ExcelColumn => ({ key, label: key, fieldType: 'text', detectedType: 'text', isPrimary: false, width: 100 })

function baseProduct(over: Partial<EnrichedProduct>): EnrichedProduct {
  return {
    description: '', advantages: [], specifications: [], variants: [], images: [],
    documents: [], sourceUrl: null, additionalSources: [], generatedAt: 0, ...over,
  }
}

describe('sheetRowToEnrichedProduct', () => {
  it('reconstruit specs + pricing depuis les colonnes ai_*', () => {
    const columns = [col('ai_name'), col('ai_specifications'), col('ai_pricing')]
    const row: ExcelRow = {
      _id: 'r1',
      ai_name: 'Perceuse',
      ai_specifications: 'Puissance: 1500 W | [Batterie]Tension: 18 V',
      ai_pricing: JSON.stringify({ ttc: 199, currency: 'EUR' }),
    }
    const p = sheetRowToEnrichedProduct(row, columns)
    expect(p).not.toBeNull()
    expect(p!.name).toBe('Perceuse')
    expect(p!.specifications).toHaveLength(2)
    expect(p!.specifications[1]).toEqual({ name: 'Tension', value: '18 V', group: 'Batterie' })
    expect(p!.pricing?.ttc).toBe(199)
  })

  it('retourne null sur une ligne sans donnée scrapée', () => {
    expect(sheetRowToEnrichedProduct({ _id: 'r2' }, [col('foo')])).toBeNull()
  })
})

describe('compareSourceVsManufacturer', () => {
  it('classe match / diff / mfr-only via synonymes et unités', () => {
    const source = baseProduct({
      brand: 'Bosch',
      specifications: [
        { name: 'Puissance', value: '1,5 kW' },       // synonyme + unité → match
        { name: 'Poids', value: '2 kg' },              // diff
      ],
    })
    const mfr = baseProduct({
      brand: 'Bosch',
      specifications: [
        { name: 'Puissance nominale absorbée', value: '1500 W' },
        { name: 'Masse', value: '2,5 kg' },
        { name: 'Couple', value: '35 Nm' },            // mfr-only
      ],
    })
    const comps = compareSourceVsManufacturer(source, mfr)
    const byKey = Object.fromEntries(comps.map((c) => [c.key, c]))
    expect(byKey['spec:puissance'].status).toBe('match')
    expect(byKey['spec:poids'].status).toBe('diff')
    expect(byKey['spec:couple'].status).toBe('mfr-only')
    expect(byKey['id:brand'].status).toBe('match')
  })

  it('utilise les paires LLM pour les specs hors dictionnaire', () => {
    const source = baseProduct({ specifications: [{ name: 'Bidule maison', value: 'X' }] })
    const mfr = baseProduct({ specifications: [{ name: 'Truc constructeur', value: 'X' }] })
    const pairs = { 'bidule maison': 'truc constructeur' }
    const comps = compareSourceVsManufacturer(source, mfr, pairs)
    // Une seule ligne fusionnée (pas de mfr-only résiduel), et match sur la valeur.
    const specs = comps.filter((c) => c.group === 'spec')
    expect(specs).toHaveLength(1)
    expect(specs[0].status).toBe('match')
  })

  it('buildRowComparison recompose depuis ai_* + ai_mfr_* + ai_mfr_alignment (déterministe)', () => {
    const columns = [
      col('ai_specifications'), col('ai_mfr_specifications'), col('ai_mfr_source'), col('ai_mfr_alignment'),
    ]
    const row: ExcelRow = {
      _id: 'r1',
      ai_specifications: 'Puissance: 1,5 kW | Bidule maison: X',
      ai_mfr_specifications: 'Puissance nominale absorbée: 1500 W | Truc constructeur: X',
      ai_mfr_source: 'https://www.bosch-professional.com/fr/fr/p',
      ai_mfr_alignment: JSON.stringify({ 'bidule maison': 'truc constructeur' }),
    }
    const comps = buildRowComparison(row, columns)
    expect(comps).not.toBeNull()
    const specs = comps!.filter((c) => c.group === 'spec')
    // Puissance (dico + unité) + Bidule↔Truc (alignement) → 2 lignes, toutes match.
    expect(specs).toHaveLength(2)
    expect(specs.every((c) => c.status === 'match')).toBe(true)
  })

  it('buildRowComparison retourne null si la ligne n’a pas été vérifiée', () => {
    expect(buildRowComparison({ _id: 'r2', ai_name: 'X' }, [col('ai_name')])).toBeNull()
  })

  it('marque les specs adoptées (provenance fabricant)', () => {
    const source = baseProduct({ specifications: [] })
    const mfr = baseProduct({ specifications: [{ name: 'Couple', value: '35 Nm' }] })
    const comps = compareSourceVsManufacturer(source, mfr, {}, new Set(['spec:couple']))
    const couple = comps.find((c) => c.key === 'spec:couple')
    expect(couple?.adopted).toBe(true)
  })

  it('dédup + apparie les specs multi-valeurs d’un même canon (Couple ×3 → 2 lignes, clés uniques)', () => {
    // Reproduit le cas réel Makita : 3 « Couple » source (dont un doublon de
    // format 65 Nm / 65 N.m) et 2 « Couple » fabricant.
    const source = baseProduct({
      specifications: [
        { name: 'Couple max. fixation franc/élastique', value: '54 / 30 Nm' },
        { name: 'Couple', value: '65 Nm' },
        { name: 'Couple de serrage', value: '65 N.m' }, // même valeur que 65 Nm, format ≠
      ],
    })
    const mfr = baseProduct({
      specifications: [
        { name: 'Couple', value: '54 / 30 Nm' },
        { name: 'Couple max', value: '65 Nm' },
      ],
    })
    const comps = compareSourceVsManufacturer(source, mfr)
    const couples = comps.filter((c) => c.group === 'spec' && c.key.startsWith('spec:couple'))
    // 65 Nm ≡ 65 N.m collapsés → 2 lignes couple, pas 3+.
    expect(couples).toHaveLength(2)
    // Appariées par valeur → toutes match (54/30 ↔ 54/30, 65 ↔ 65).
    expect(couples.every((c) => c.status === 'match')).toBe(true)
    // Clés uniques (pas de collision React / adoption).
    expect(new Set(couples.map((c) => c.key)).size).toBe(2)
    // La 2e occurrence garde son libellé brut + est marquée non-adoptable.
    expect(couples[0].dupCanon).toBeFalsy()
    expect(couples[1].dupCanon).toBe(true)
  })

  it('summarize compte confirmés/complétés/divergents', () => {
    const s = summarize([
      { key: 'a', label: 'a', group: 'spec', sourceValue: '1', mfrValue: '1', status: 'match' },
      { key: 'b', label: 'b', group: 'spec', sourceValue: null, mfrValue: '2', status: 'mfr-only' },
      { key: 'c', label: 'c', group: 'spec', sourceValue: '3', mfrValue: '4', status: 'diff' },
    ])
    expect(s).toEqual({ confirmed: 1, completed: 1, divergent: 1, total: 3 })
  })
})
