import { describe, it, expect } from 'vitest'
import { deriveMeasures, type DerivableColumn } from './deriveMeasures'

const columns: DerivableColumn[] = [
  { key: 'brand', label: 'Marque', kind: 'text' },
  { key: 'price', label: 'Prix de vente', kind: 'number', format: 'eur' },
]

describe('deriveMeasures', () => {
  it('produit les agrégations que le TYPE de chaque colonne autorise', () => {
    const m = deriveMeasures(columns)
    // 3 pour un texte, 8 pour un nombre.
    expect(m).toHaveLength(11)
    expect(m.filter((x) => x.id.endsWith(':brand')).map((x) => x.id))
      .toEqual(['count:brand', 'countDistinct:brand', 'filledPct:brand'])
    expect(m.some((x) => x.id === 'sum:price')).toBe(true)
    expect(m.some((x) => x.id === 'sum:brand')).toBe(false)
  })

  it('porte le nom RÉEL de la colonne dans `label`, l’agrégation dans `labelKey`', () => {
    const sum = deriveMeasures(columns).find((x) => x.id === 'sum:price')
    expect(sum?.label).toBe('Prix de vente')
    expect(sum?.labelKey).toBe('bi.agg.sum')
    // ⚠ Le nom vient de la donnée : il ne doit JAMAIS passer par le catalogue i18n.
    expect(sum?.labelKey).not.toBe('Prix de vente')
  })

  it('marque médiane et taux de remplissage comme non agrégeables', () => {
    const m = deriveMeasures(columns)
    expect(m.find((x) => x.id === 'median:price')?.aggregable).toBe(false)
    expect(m.find((x) => x.id === 'filledPct:brand')?.aggregable).toBe(false)
    expect(m.find((x) => x.id === 'sum:price')?.aggregable).toBe(true)
  })

  it('conserve l’unité de la colonne sur les agrégations qui rendent une de ses valeurs', () => {
    const m = deriveMeasures(columns)
    expect(m.find((x) => x.id === 'sum:price')?.format).toBe('eur')
    expect(m.find((x) => x.id === 'count:price')?.format).toBe('int')
  })

  it('chaque mesure sait se calculer sur des lignes', () => {
    const avg = deriveMeasures(columns).find((x) => x.id === 'avg:price')
    expect(avg?.compute([{ price: 100 }, { price: '' }, { price: 300 }])).toBe(200)
  })

  it('porte le nom d’une colonne de CATALOGUE dans `columnKey`, pas dans `label`', () => {
    // Les sources déclarées en dur (veille tarifaire) n'ont aucun nom « venu de la donnée » :
    // leur colonne se nomme par une clé i18n, que le consommateur traduit et compose avec
    // l'agrégation. Sans ce champ, toutes leurs mesures s'appelaient « Somme ».
    const [m] = deriveMeasures([{ key: 'indexed', labelKey: 'bi.measure.watchIndexed', kind: 'number' }])
    expect(m.columnKey).toBe('bi.measure.watchIndexed')
    expect(m.label).toBeUndefined()
  })

  it('⚠⚠ ne dérive AUCUNE somme d’une colonne de pourcentage', () => {
    const m = deriveMeasures([{ key: 'medGapPct', label: 'Écart médian', kind: 'number', format: 'pct' }])
    expect(m.map((x) => x.id)).not.toContain('sum:medGapPct')
    // Ce qui reste garde l'unité, et refuse d'être recomposé entre groupes.
    const avg = m.find((x) => x.id === 'avg:medGapPct')
    expect(avg?.format).toBe('pct')
    expect(avg?.aggregable).toBe(false)
    expect(m.find((x) => x.id === 'count:medGapPct')?.aggregable).toBe(true)
  })

  it('sans colonne, aucune mesure — et surtout pas d’erreur', () => {
    expect(deriveMeasures([])).toEqual([])
  })
})
