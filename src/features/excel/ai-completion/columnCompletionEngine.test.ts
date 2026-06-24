import { describe, it, expect } from 'vitest'
import {
  buildChunks, resolveColumnRefs, isRowEmpty, buildBatchPrompt,
  mapResults, uniqueColumnKey, CompletionBatchSchema,
} from './columnCompletionEngine'
import type { ExcelColumn, ExcelRow } from '@/features/excel/types'

const col = (key: string, label: string): ExcelColumn =>
  ({ key, label, fieldType: 'text', detectedType: 'text', isPrimary: false, width: 100 })
const COLS = [col('desc', 'Description'), col('name', 'Nom')]

describe('buildChunks', () => {
  it('découpe 174 lignes en lots de 20 (dernier = 14)', () => {
    const rows = Array.from({ length: 174 }, (_, i) => ({ _id: `r${i}` }))
    const chunks = buildChunks(rows, 20)
    expect(chunks.length).toBe(9)
    expect(chunks[8].length).toBe(14)
  })
})

describe('resolveColumnRefs', () => {
  it('remplace [Label] et [key] par la valeur de la ligne', () => {
    const row: ExcelRow = { _id: 'r1', desc: 'Perceuse 18V', name: '' }
    expect(resolveColumnRefs('Nom court de [Description]', row, COLS)).toBe('Nom court de Perceuse 18V')
    expect(resolveColumnRefs('val [desc]', row, COLS)).toBe('val Perceuse 18V')
  })
  it('référence inconnue → chaîne vide', () => {
    const row: ExcelRow = { _id: 'r1', desc: 'x', name: 'y' }
    expect(resolveColumnRefs('[Inexistant]', row, COLS)).toBe('')
  })
})

describe('isRowEmpty', () => {
  it('vrai quand toutes les références résolues sont vides', () => {
    expect(isRowEmpty('[Description]', { _id: 'r1', desc: '', name: 'y' }, COLS)).toBe(true)
    expect(isRowEmpty('[Description]', { _id: 'r1', desc: 'x', name: '' }, COLS)).toBe(false)
  })
})

describe('buildBatchPrompt', () => {
  it('numérote les entrées 0..n-1 avec les références résolues', () => {
    const chunk: ExcelRow[] = [
      { _id: 'a', desc: 'Perceuse', name: '' },
      { _id: 'b', desc: 'Visseuse', name: '' },
    ]
    const p = buildBatchPrompt('Nom court de [Description]', chunk, COLS)
    expect(p).toContain('0:')
    expect(p).toContain('Perceuse')
    expect(p).toContain('1:')
    expect(p).toContain('Visseuse')
  })
})

describe('mapResults', () => {
  it('mappe les résultats indexés vers rowId ; index manquant absent', () => {
    const chunk: ExcelRow[] = [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }]
    const parsed = CompletionBatchSchema.parse({ results: [{ i: 0, v: 'X' }, { i: 2, v: 'Z' }] })
    const m = mapResults(parsed, chunk)
    expect(m).toEqual({ a: 'X', c: 'Z' })
  })
  it('index hors plage → lève une erreur (lot incohérent)', () => {
    const chunk: ExcelRow[] = [{ _id: 'a' }]
    const parsed = CompletionBatchSchema.parse({ results: [{ i: 5, v: 'X' }] })
    expect(() => mapResults(parsed, chunk)).toThrow('Indices de lot incohérents')
  })
  it('index décalé 1-based → lève une erreur', () => {
    const chunk: ExcelRow[] = [{ _id: 'a' }, { _id: 'b' }]
    const parsed = CompletionBatchSchema.parse({ results: [{ i: 1, v: 'A' }, { i: 2, v: 'B' }] })
    expect(() => mapResults(parsed, chunk)).toThrow('Indices de lot incohérents')
  })
  it('index partiellement manquant (dans la plage) → toléré, pas de throw', () => {
    const chunk: ExcelRow[] = [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }]
    const parsed = CompletionBatchSchema.parse({ results: [{ i: 0, v: 'X' }, { i: 2, v: 'Z' }] })
    expect(() => mapResults(parsed, chunk)).not.toThrow()
    expect(mapResults(parsed, chunk)).toEqual({ a: 'X', c: 'Z' })
  })
})

describe('uniqueColumnKey', () => {
  it('slug du label, suffixé si collision', () => {
    const existing = [col('nom_court', 'Nom court')]
    expect(uniqueColumnKey('Nouvelle Col', existing)).toBe('nouvelle_col')
    expect(uniqueColumnKey('Nom court', existing)).toBe('nom_court_2')
  })
})
