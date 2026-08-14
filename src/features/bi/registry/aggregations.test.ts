import { describe, it, expect } from 'vitest'
import {
  aggregationFormat, allowedAggregations, allowedAggregationsFor, computeAggregation,
  isAggregable, isAggregableFor,
} from './aggregations'
import type { Row } from './types'

const rows: Row[] = [
  { price: 100, brand: 'Makita' },
  { price: '', brand: 'Makita' },
  { price: 300, brand: null },
]

describe('computeAggregation — ce qui n’est pas un nombre n’entre pas dans le calcul', () => {
  it('la moyenne sur trois valeurs dont une vide se divise par DEUX', () => {
    expect(computeAggregation(rows, 'price', 'avg')).toBe(200)
  })

  it('la somme ignore le vide plutôt que de le compter zéro', () => {
    expect(computeAggregation(rows, 'price', 'sum')).toBe(400)
  })

  it('une valeur texte ne contamine ni la somme ni la moyenne', () => {
    const r: Row[] = [{ v: 10 }, { v: 'indisponible' }, { v: 30 }]
    expect(computeAggregation(r, 'v', 'sum')).toBe(40)
    expect(computeAggregation(r, 'v', 'avg')).toBe(20)
  })

  it('lit « 1 299,90 € » comme un nombre', () => {
    const r: Row[] = [{ v: '1 299,90 €' }, { v: '700,10' }]
    expect(computeAggregation(r, 'v', 'sum')).toBeCloseTo(2000, 6)
  })

  it('rend null — jamais 0 — quand aucun nombre ne se lit', () => {
    const r: Row[] = [{ v: '' }, { v: 'n/a' }]
    for (const agg of ['avg', 'median', 'min', 'max'] as const) {
      expect(computeAggregation(r, 'v', agg)).toBeNull()
    }
    // La somme de rien vaut 0, et c'est vrai.
    expect(computeAggregation(r, 'v', 'sum')).toBe(0)
  })
})

describe('computeAggregation — décomptes', () => {
  it('countDistinct compte les valeurs PRÉSENTES, l’absence n’en est pas une', () => {
    expect(computeAggregation(rows, 'brand', 'countDistinct')).toBe(1)
    expect(computeAggregation(rows, 'price', 'countDistinct')).toBe(2)
  })

  it('count compte les valeurs renseignées de la colonne', () => {
    expect(computeAggregation(rows, 'brand', 'count')).toBe(2)
    expect(computeAggregation(rows, 'price', 'count')).toBe(2)
  })

  it('filledPct rend un pourcentage 0–100', () => {
    expect(computeAggregation(rows, 'price', 'filledPct')).toBeCloseTo(66.666, 2)
    expect(computeAggregation([], 'price', 'filledPct')).toBeNull()
  })

  it('une chaîne d’espaces n’est pas une valeur renseignée', () => {
    expect(computeAggregation([{ v: '   ' }], 'v', 'count')).toBe(0)
  })
})

describe('computeAggregation — médiane', () => {
  it('effectif IMPAIR : la valeur centrale', () => {
    expect(computeAggregation([{ v: 3 }, { v: 1 }, { v: 2 }], 'v', 'median')).toBe(2)
  })

  it('effectif PAIR : la moyenne des DEUX valeurs centrales', () => {
    expect(computeAggregation([{ v: 1 }, { v: 2 }, { v: 3 }, { v: 10 }], 'v', 'median')).toBe(2.5)
  })

  it('trie par valeur, pas par ordre alphabétique', () => {
    expect(computeAggregation([{ v: 9 }, { v: 10 }, { v: 11 }], 'v', 'median')).toBe(10)
  })

  it('min et max lisent les nombres écrits en toutes lettres de cellule', () => {
    const r: Row[] = [{ v: '12,5' }, { v: '3' }, { v: '' }]
    expect(computeAggregation(r, 'v', 'min')).toBe(3)
    expect(computeAggregation(r, 'v', 'max')).toBe(12.5)
  })
})

describe('traits des agrégations', () => {
  it('médiane et taux de remplissage ne se totalisent pas entre groupes', () => {
    expect(isAggregable('median')).toBe(false)
    expect(isAggregable('filledPct')).toBe(false)
    expect(isAggregable('sum')).toBe(true)
    expect(isAggregable('count')).toBe(true)
  })

  it('les agrégations numériques sont réservées aux colonnes numériques', () => {
    expect(allowedAggregations('text')).toEqual(['count', 'countDistinct', 'filledPct'])
    expect(allowedAggregations('date')).toEqual(['count', 'countDistinct', 'filledPct'])
    expect(allowedAggregations('number')).toContain('sum')
    expect(allowedAggregations('number')).toHaveLength(8)
  })

  it('⚠⚠ une colonne de POURCENTAGE ne se somme jamais', () => {
    // Additionner des taux ne produit aucune grandeur — et c'est le geste qui affichait
    // « −312 % » en totalisant vingt-quatre écarts médians.
    expect(allowedAggregationsFor('number', 'pct')).not.toContain('sum')
    expect(allowedAggregationsFor('number', 'pct')).toContain('median')
    // Les autres unités gardent la somme, et le type continue de commander.
    expect(allowedAggregationsFor('number', 'eur')).toContain('sum')
    expect(allowedAggregationsFor('number')).toEqual(allowedAggregations('number'))
    expect(allowedAggregationsFor('text', 'pct')).toEqual(['count', 'countDistinct', 'filledPct'])
  })

  it('⚠ ce qui rend une valeur d’une colonne de pourcentage ne se recompose pas', () => {
    // Moyenne, minimum, maximum d'un taux ne se totalisent pas plus qu'une médiane…
    for (const agg of ['avg', 'min', 'max', 'median'] as const) {
      expect(isAggregableFor(agg, 'pct')).toBe(false)
      expect(isAggregableFor(agg, 'eur')).toBe(isAggregable(agg))
    }
    // … mais COMPTER des lignes reste additif, quelle que soit l'unité comptée.
    expect(isAggregableFor('count', 'pct')).toBe(true)
    expect(isAggregableFor('countDistinct', 'pct')).toBe(true)
  })

  it('l’unité de la colonne survit aux agrégations qui rendent une de ses valeurs', () => {
    expect(aggregationFormat('sum', 'eur')).toBe('eur')
    expect(aggregationFormat('median', 'eur')).toBe('eur')
    // Un décompte n'est pas en euros, et un taux reste un pourcentage.
    expect(aggregationFormat('count', 'eur')).toBe('int')
    expect(aggregationFormat('filledPct', 'eur')).toBe('pct')
    expect(aggregationFormat('sum')).toBe('float')
  })
})
