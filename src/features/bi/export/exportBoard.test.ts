// ⚠⚠ Ce que ces tests protègent : un fichier qui circule sans dire ce qu'il montre. Un
// export muet sur ses filtres fait voyager un chiffre partiel comme s'il était le total.
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { buildWorkbook, type ExportedTile, type ExportContext } from './exportBoard'
import type { AggregateResult } from '../engine/aggregate'

const result: AggregateResult = {
  columns: [
    { key: 'domain', labelKey: 'bi.dim.brand', role: 'dimension' },
    { key: 'count', labelKey: 'bi.measure.count', role: 'measure', format: 'int' },
  ],
  rows: [
    { domain: '123courroies.com', count: 1188 },
    { domain: null, count: 12 },
  ],
}

const tile = (title: string): ExportedTile => ({
  title, result, headers: ['Concurrent', 'Fiches appariées'],
})

const ctx: ExportContext = {
  boardName: 'Écarts concurrents',
  sourceLabel: 'Veille — synthèse par concurrent',
  filters: ['Univers : COURROIES', 'Concurrent : 123courroies.com'],
  takenAt: '15/08/2026 08:12',
}

const rowsOf = (wb: XLSX.WorkBook, name: string): unknown[][] =>
  XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 })

describe('classeur exporté', () => {
  it('ouvre sur une feuille qui DIT les filtres actifs', () => {
    const wb = buildWorkbook([tile('Appariés par concurrent')], ctx)
    const head = rowsOf(wb, 'Lecture').flat().join(' | ')
    expect(head).toContain('Écarts concurrents')
    expect(head).toContain('Veille — synthèse par concurrent')
    expect(head).toContain('Univers : COURROIES')
    expect(head).toContain('Concurrent : 123courroies.com')
  })

  it('dit « Aucun » plutôt que de laisser la rubrique vide', () => {
    // ⚠ Une rubrique vide se lit comme une information manquante, pas comme une absence de
    // filtre — et le doute suffit à faire rejeter le chiffre.
    const wb = buildWorkbook([tile('T')], { ...ctx, filters: [] })
    expect(rowsOf(wb, 'Lecture').flat().join(' ')).toContain('Aucun')
  })

  it('exporte les valeurs BRUTES, pour qu’Excel puisse les sommer', () => {
    const wb = buildWorkbook([tile('Appariés')], ctx)
    const rows = rowsOf(wb, 'Appariés')
    expect(rows[0]).toEqual(['Concurrent', 'Fiches appariées'])
    expect(rows[1]).toEqual(['123courroies.com', 1188])
    // Une valeur absente reste vide : « 0 » se sommerait comme une donnée.
    expect(rows[2][0]).toBe('')
  })

  it('tronque un titre trop long et distingue deux tuiles homonymes', () => {
    // Excel refuse un onglet de plus de 31 caractères, et deux onglets de même nom.
    const long = 'Fiches appariées par concurrent et par univers'
    const wb = buildWorkbook([tile(long), tile(long)], ctx)
    const names = wb.SheetNames.filter((n) => n !== 'Lecture')
    expect(names).toHaveLength(2)
    expect(names[0]).not.toBe(names[1])
    expect(names.every((n) => n.length <= 31)).toBe(true)
  })

  it('nomme une tuile sans titre plutôt que de produire un onglet vide', () => {
    const wb = buildWorkbook([tile('')], ctx)
    expect(wb.SheetNames).toContain('Tuile 1')
  })
})
