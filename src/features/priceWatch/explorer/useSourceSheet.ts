// Feuille PIM servant de source aux DESCRIPTIONS et VISUELS F1. Le catalogue persisté
// de la veille ne porte que l'identité et le prix (cf. `sourceExtras.ts`) : ces deux
// champs sont donc joints en direct depuis la base ouverte dans le PIM.
import { useMemo, useState } from 'react'
import { useExcelStore } from '@/stores/excel.store'
import { buildSourceExtras, type SourceExtrasIndex } from './sourceExtras'

export interface SourceSheetState {
  sheet: { name: string; rows: number } | null
  sheets: { name: string; rows: number }[]
  sheetIndex: number
  setSheetIndex: (i: number) => void
  extras: SourceExtrasIndex
}

export function useSourceSheet(): SourceSheetState {
  const sheets = useExcelStore((s) => s.sheets)
  const activeIndex = useExcelStore((s) => s.activeSheetIndex)
  // Choix explicite prioritaire ; à défaut, la feuille ouverte dans le PIM.
  const [picked, setPicked] = useState<number | null>(null)
  const index = picked != null && picked < sheets.length ? picked : activeIndex
  const current = sheets[index]

  const extras = useMemo(
    () => (current ? buildSourceExtras(current.columns, current.rows) : buildSourceExtras([], [])),
    [current],
  )

  return {
    sheet: current ? { name: current.name, rows: current.rows.length } : null,
    sheets: sheets.map((s) => ({ name: s.name, rows: s.rows.length })),
    sheetIndex: index,
    setSheetIndex: setPicked,
    extras,
  }
}
