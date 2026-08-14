// Ce qu'une zone ACCEPTE — et surtout ce qu'elle refuse, avec la bonne raison. Un refus qui
// porterait le mauvais motif serait pire qu'un refus muet : il enverrait chercher ailleurs.
import { describe, it, expect } from 'vitest'
import { acceptField, bestWellFor } from './wellRules'
import { dropInWell } from './wellEdits'
import { testSource, testTile } from './wellFixture'
import type { Tile } from '../types'

const brand = { role: 'dimension' as const, id: 'brand', label: 'Marque' }
const price = { role: 'dimension' as const, id: 'price', label: 'Prix' }
const completeness = { role: 'measure' as const, id: 'pim.completeness', label: 'Complétude' }
const medianPrice = { role: 'measure' as const, id: 'median:price', label: 'Médiane · Prix' }

const reason = (v: ReturnType<typeof acceptField>) => (v.ok ? null : v.reasonKey)

describe('acceptField', () => {
  it('refuse tout tant qu’aucun visuel n’est sélectionné', () => {
    expect(reason(acceptField('values', null, completeness, testSource)))
      .toBe('bi.well.refuse.noSelection')
  })

  it('refuse une dimension à un INDICATEUR — il n’affiche qu’une valeur', () => {
    expect(reason(acceptField('axis', testTile('kpi'), brand, testSource)))
      .toBe('bi.well.refuse.kpiDimension')
  })

  it('refuse une mesure là où il faut une dimension', () => {
    expect(reason(acceptField('axis', testTile('bar'), completeness, testSource)))
      .toBe('bi.well.refuse.needDimension')
  })

  it('refuse une légende tant que l’axe est vide', () => {
    expect(reason(acceptField('legend', testTile('bar'), brand, testSource)))
      .toBe('bi.well.refuse.legendNeedsAxis')
  })

  it('refuse une légende à un tableau, qui range ses champs sur l’axe', () => {
    expect(reason(acceptField('legend', testTile('table', ['brand']), price, testSource)))
      .toBe('bi.well.refuse.tableLegend')
  })

  it('refuse une info-bulle hors graphique', () => {
    expect(reason(acceptField('tooltips', testTile('table', ['brand']), completeness, testSource)))
      .toBe('bi.well.refuse.tooltipNeedsChart')
  })

  it('refuse un champ déjà posé dans la zone', () => {
    const t = dropInWell(testTile('bar'), 'axis', brand, testSource)
    expect(reason(acceptField('axis', t, brand, testSource))).toBe('bi.well.refuse.already')
  })

  it('refuse un champ déjà posé dans l’AUTRE zone de mesures', () => {
    const t = dropInWell(testTile('bar', ['brand']), 'tooltips', medianPrice, testSource)
    expect(reason(acceptField('values', t, medianPrice, testSource)))
      .toBe('bi.well.refuse.already')
  })

  it('refuse une mesure non agrégeable là où elle serait TOTALISÉE', () => {
    // Camembert : chaque part est une fraction d'un tout — la médiane n'en est pas une.
    expect(reason(acceptField('values', testTile('pie', ['brand']), medianPrice, testSource)))
      .toBe('bi.well.refuse.nonAggregable')
    const stacked: Tile = { ...testTile('bar', ['brand']), options: { stacked: true } }
    expect(reason(acceptField('values', stacked, completeness, testSource)))
      .toBe('bi.well.refuse.nonAggregable')
  })

  it('ACCEPTE la même mesure sur un graphe à barres simple : par groupe, elle est juste', () => {
    expect(acceptField('values', testTile('bar', ['brand']), medianPrice, testSource).ok).toBe(true)
  })

  it('refuse un filtre sur une mesure calculée après le filtrage', () => {
    expect(reason(acceptField('visualFilters', testTile('bar', ['brand']), completeness, testSource)))
      .toBe('bi.well.refuse.filterNeedsColumn')
  })

  it('accepte un filtre sur la COLONNE d’une mesure dérivée', () => {
    expect(acceptField('visualFilters', testTile('bar', ['brand']), medianPrice, testSource).ok)
      .toBe(true)
  })

  it('interdit de mêler une légende et plusieurs mesures', () => {
    const legended = dropInWell(dropInWell(testTile('bar'), 'axis', brand, testSource),
      'legend', price, testSource)
    expect(reason(acceptField('values', legended, price, testSource)))
      .toBe('bi.well.refuse.legendOrMeasures')
    const twoMeasures = dropInWell(dropInWell(testTile('bar'), 'axis', brand, testSource),
      'values', price, testSource)
    expect(reason(acceptField('legend', twoMeasures, price, testSource)))
      .toBe('bi.well.refuse.legendOrMeasures')
  })
})

describe('bestWellFor', () => {
  it('envoie une mesure aux valeurs et une dimension à l’axe', () => {
    expect(bestWellFor(testTile('bar'), completeness, testSource)).toBe('values')
    expect(bestWellFor(testTile('bar'), brand, testSource)).toBe('axis')
  })

  it('se replie sur les valeurs pour un indicateur, qui n’a pas d’axe', () => {
    expect(bestWellFor(testTile('kpi'), brand, testSource)).toBe('values')
  })

  it('se replie sur la légende quand l’axe est déjà pris', () => {
    const t = dropInWell(testTile('bar'), 'axis', brand, testSource)
    expect(bestWellFor(t, price, testSource)).toBe('legend')
  })
})
