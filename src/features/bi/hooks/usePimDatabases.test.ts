// ⚠⚠ Charger une base, c'est REMPLACER les feuilles en mémoire — celles du module Données
// comprises. Ce fichier tient les quatre garde-fous du chargement : il ne part que s'il est
// réclamé, il recopie l'identité de la base (sans quoi l'enregistrement automatique du module
// Données réécrirait l'ANCIENNE base), il pose explicitement la feuille active, et il refuse
// d'écraser un import local jamais enregistré.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useExcelStore } from '@/stores/excel.store'
import type { ExcelSheet } from '@/features/excel/types'
import { usePimDbLoader, usePimDbState, resetPimDbStateForTest, type PimDatabase } from './usePimDatabases'

const loadFromFirebase = vi.fn<(id: string) => Promise<ExcelSheet[] | null>>()

vi.mock('@/features/excel/useExcelFirebase', () => ({
  useExcelFirebase: () => ({ loadFromFirebase, listSavedFiles: () => Promise.resolve([]) }),
}))

const sheet = (name: string): ExcelSheet => ({
  name, rows: [], taxonomy: [],
  columns: [{ key: 'ref', label: 'Réf', fieldType: 'text', detectedType: 'text', isPrimary: true, width: 160 }],
})

const LIST: PimDatabase[] = [
  { docId: 'db1', name: 'Catalogue_GSB_2026', rows: 43_210, path: ['B2B'] },
]

const load = (over: Partial<Parameters<typeof usePimDbLoader>[0]> = {}) =>
  renderHook(() => {
    usePimDbLoader({
      dbId: 'db1', sheetName: undefined, list: LIST, listLoading: false, wanted: true, ...over,
    })
    return usePimDbState()
  })

beforeEach(() => {
  resetPimDbStateForTest()
  useExcelStore.getState().reset()
  loadFromFirebase.mockReset().mockResolvedValue([sheet('Feuille 1'), sheet('Prix'), sheet('Stock')])
})

describe('usePimDbLoader', () => {
  it('⚠⚠ ne lit RIEN tant qu’aucune tuile ne réclame la source (ni aucun choix explicite)', () => {
    const { result } = load({ wanted: false })
    expect(loadFromFirebase).not.toHaveBeenCalled()
    expect(result.current.state).toBe('idle')
  })

  it('ne lit rien non plus quand le tableau ne retient aucune base (comportement d’avant)', () => {
    load({ dbId: undefined })
    expect(loadFromFirebase).not.toHaveBeenCalled()
  })

  it('⚠⚠ recopie l’identité de la base : sans elle, l’auto-save du module Données écraserait l’ancienne', async () => {
    load()
    await waitFor(() => expect(useExcelStore.getState().currentDocId).toBe('db1'))
    expect(useExcelStore.getState().currentFileName).toBe('Catalogue_GSB_2026')
    expect(useExcelStore.getState().currentPath).toEqual(['B2B'])
  })

  it('⚠⚠ pose la feuille active EXPLICITEMENT — `setSheets` clampe l’index, il ne le remet pas à zéro', async () => {
    useExcelStore.setState({ activeSheetIndex: 2 })
    load()
    await waitFor(() => expect(useExcelStore.getState().currentDocId).toBe('db1'))
    // Sans ce choix, la base serait mesurée sur sa TROISIÈME feuille, sans le moindre signal.
    expect(useExcelStore.getState().activeSheetIndex).toBe(0)
  })

  it('retombe sur la feuille de CONSTRUCTION quand le tableau en désigne une', async () => {
    load({ sheetName: 'Prix' })
    await waitFor(() => expect(useExcelStore.getState().activeSheetIndex).toBe(1))
  })

  it('⚠⚠ refuse d’écraser un import local jamais enregistré, et DIT pourquoi', async () => {
    useExcelStore.getState().setSheets([sheet('Import du jour')])
    const { result } = load()
    await waitFor(() => expect(result.current.state).toBe('error'))
    expect(result.current.message).toEqual({ kind: 'key', key: 'bi.db.unsavedSheets' })
    expect(loadFromFirebase).not.toHaveBeenCalled()
  })

  it('annonce le chargement AVEC le nom et la volumétrie — un écran muet se lit comme une panne', async () => {
    let resolve: (v: ExcelSheet[]) => void = () => {}
    loadFromFirebase.mockReturnValue(new Promise((r) => { resolve = r }))
    const { result } = load()
    await waitFor(() => expect(result.current.state).toBe('loading'))
    expect(result.current.name).toBe('Catalogue_GSB_2026')
    expect(result.current.rows).toBe(43_210)
    resolve([sheet('Feuille 1')])
  })

  it('⚠ base disparue de la liste : le dit, plutôt que de rester sur des chiffres d’une autre', async () => {
    const { result } = load({ dbId: 'parti' })
    await waitFor(() => expect(result.current.state).toBe('error'))
    expect(result.current.message).toEqual({ kind: 'key', key: 'bi.db.missing' })
  })

  it('⚠ ne conclut à rien tant que la LISTE arrive : « introuvable » serait faux', () => {
    const { result } = load({ dbId: 'parti', listLoading: true })
    expect(result.current.state).toBe('loading')
  })

  it('la base déjà en mémoire n’est pas relue', async () => {
    useExcelStore.getState().setCurrentDocId('db1')
    const { result } = load()
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(loadFromFirebase).not.toHaveBeenCalled()
  })
})
