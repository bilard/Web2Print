import * as XLSX from 'xlsx'
import type { AnalyticsEvent } from './metrics'

/** Neutralise l'injection de formule CSV (=, +, -, @ en tête de cellule). */
function csvSafe(v: string): string {
  return /^[=+\-@]/.test(v) ? `'${v}` : v
}

function rows(events: AnalyticsEvent[]) {
  return events.map((e) => ({
    date: new Date(e.ts).toISOString(),
    path: csvSafe(e.path),
    area: csvSafe(e.area),
    source: csvSafe(e.src ?? e.ref ?? ''),
    device: csvSafe(e.device),
    country: csvSafe(e.country ?? ''),
    visitor: csvSafe(e.vid),
    session: csvSafe(e.sid),
    uid: csvSafe(e.uid ?? ''),
  }))
}

export function eventsToCsv(events: AnalyticsEvent[]): string {
  const ws = XLSX.utils.json_to_sheet(rows(events))
  return XLSX.utils.sheet_to_csv(ws)
}

export function downloadEventsCsv(events: AnalyticsEvent[], filename: string): void {
  const csv = eventsToCsv(events)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
