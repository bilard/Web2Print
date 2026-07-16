import { describe, it, expect } from 'vitest'
import type { ExcelColumn, ExcelRow } from '@/features/excel/types'
import type { EnrichedProduct } from '@/features/excel/ai-enrichment/types'
import { sheetRowToEnrichedProduct, compareSourceVsManufacturer, summarize } from './compareProducts'

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

  it('summarize compte confirmés/complétés/divergents', () => {
    const s = summarize([
      { key: 'a', label: 'a', group: 'spec', sourceValue: '1', mfrValue: '1', status: 'match' },
      { key: 'b', label: 'b', group: 'spec', sourceValue: null, mfrValue: '2', status: 'mfr-only' },
      { key: 'c', label: 'c', group: 'spec', sourceValue: '3', mfrValue: '4', status: 'diff' },
    ])
    expect(s).toEqual({ confirmed: 1, completed: 1, divergent: 1, total: 3 })
  })
})
