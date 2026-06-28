import * as XLSX from 'xlsx'
import type { AnalyticsEvent } from './metrics'

function rows(events: AnalyticsEvent[]) {
  return events.map((e) => ({
    date: new Date(e.ts).toISOString(),
    path: e.path,
    area: e.area,
    source: e.src ?? e.ref ?? '',
    device: e.device,
    country: e.country ?? '',
    visitor: e.vid,
    session: e.sid,
    uid: e.uid ?? '',
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
