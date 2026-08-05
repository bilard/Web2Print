// Base PIM servant de source aux DESCRIPTIONS, VISUELS et à la TAXONOMIE F1. Le catalogue
// persisté de la veille ne porte que l'identité et le prix (cf. `sourceExtras.ts`).
//
// ⚠ La base à joindre n'est PAS forcément celle ouverte dans le PIM : le catalogue client
// (« F1 Google ») peut être une autre base entièrement. On liste donc toutes les bases et
// on lit celle choisie SANS toucher au store excel (`fetchSheetsQuiet`) — basculer la base
// active de l'utilisateur parce qu'il consulte des concurrents serait un effet de bord.
import { useEffect, useMemo, useState } from 'react'
import { useExcelStore } from '@/stores/excel.store'
import { useExcelFirebase } from '@/features/excel/useExcelFirebase'
import { fetchSheetsQuiet } from '@/features/manufacturer-verify/insights/fetchSheetsQuiet'
import type { ExcelSheet } from '@/features/excel/types'
import { buildSourceExtras, type SourceExtrasIndex } from './sourceExtras'
import { debugLog } from '@/lib/debugLog'

/** Base ouverte dans le PIM (valeur par défaut du sélecteur). */
const OPEN_DB = '__open__'
const PREF_KEY = 'pwx:sourceDb'

export interface SourceDbOption { docId: string; label: string; rows: number }

export interface SourceSheetState {
  /** Bases proposées : celle ouverte, puis toutes les bases enregistrées. */
  databases: SourceDbOption[]
  dbId: string
  setDbId: (id: string) => void
  loading: boolean
  sheets: { name: string; rows: number }[]
  sheetIndex: number
  setSheetIndex: (i: number) => void
  extras: SourceExtrasIndex
}

export function useSourceSheet(): SourceSheetState {
  const openSheets = useExcelStore((s) => s.sheets)
  const activeIndex = useExcelStore((s) => s.activeSheetIndex)
  const { listSavedFiles } = useExcelFirebase()

  const [databases, setDatabases] = useState<SourceDbOption[]>([])
  const [dbId, setDbIdState] = useState<string>(() => {
    try { return window.localStorage.getItem(PREF_KEY) ?? OPEN_DB } catch { return OPEN_DB }
  })
  const [loaded, setLoaded] = useState<ExcelSheet[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)

  const setDbId = (id: string) => {
    setDbIdState(id); setPicked(null)
    try { window.localStorage.setItem(PREF_KEY, id) } catch { /* préférence non persistée */ }
  }

  useEffect(() => {
    let cancelled = false
    listSavedFiles()
      .then((files) => {
        if (cancelled) return
        setDatabases(files.map((f) => ({ docId: f.docId, label: f.fileName, rows: f.totalRows })))
      })
      .catch(() => { /* liste indisponible : le sélecteur reste sur la base ouverte */ })
    return () => { cancelled = true }
    // Liste dressée au montage seulement : `listSavedFiles` est recréé à chaque rendu
    // du hook, le mettre en dépendance relancerait la requête en boucle.
  }, [])

  // Lecture de la base choisie, hors store. Rechargée seulement au changement de base.
  useEffect(() => {
    if (dbId === OPEN_DB) { setLoaded(null); return }
    let cancelled = false
    setLoading(true)
    fetchSheetsQuiet(dbId)
      .then((s) => {
        if (cancelled) return
        debugLog('[pw-explorer] base source', dbId, s ? `${s.length} feuille(s)` : 'illisible')
        setLoaded(s); setLoading(false)
      })
      .catch(() => { if (!cancelled) { setLoaded(null); setLoading(false) } })
    return () => { cancelled = true }
  }, [dbId])

  const sheets = dbId === OPEN_DB ? openSheets : (loaded ?? [])
  const index = picked != null && picked < sheets.length ? picked : (dbId === OPEN_DB ? activeIndex : 0)
  const current = sheets[index]

  const extras = useMemo(
    () => buildSourceExtras(current?.columns ?? [], current?.rows ?? []),
    [current],
  )

  return {
    databases, dbId, setDbId, loading,
    sheets: sheets.map((s) => ({ name: s.name, rows: s.rows.length })),
    sheetIndex: index,
    setSheetIndex: setPicked,
    extras,
  }
}

export { OPEN_DB }
