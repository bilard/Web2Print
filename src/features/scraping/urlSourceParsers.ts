/**
 * Parseurs d'URLs depuis sources externes : textarea libre, fichier CSV/Excel,
 * Google Sheet (export CSV via Drive API).
 *
 * Pas de dépendance externe au runtime — `xlsx` est lazy-loaded uniquement quand
 * un fichier Excel est uploadé.
 */

const URL_REGEX = /https?:\/\/[^\s,;|"'<>(){}\]]+/g

/** Extrait toutes les URLs http(s) d'un texte libre. Dédup en ordre d'apparition. */
export function extractUrlsFromText(text: string): string[] {
  if (!text) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of text.matchAll(URL_REGEX)) {
    const url = m[0].replace(/[.,;:)\]}>]+$/, '')  // trim trailing punctuation
    if (seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

/** Parse un CSV brut (séparateur auto-détecté entre `,` `;` `\t`).
 *  Retourne les lignes normalisées en cellules trimmées. Ignore les lignes vides. */
function parseCsv(raw: string): string[][] {
  if (!raw.trim()) return []
  // Détection séparateur sur la 1ère ligne non vide
  const firstLine = raw.split(/\r?\n/).find((l) => l.trim()) ?? ''
  const tabs = (firstLine.match(/\t/g) ?? []).length
  const semis = (firstLine.match(/;/g) ?? []).length
  const commas = (firstLine.match(/,/g) ?? []).length
  const sep = tabs >= Math.max(semis, commas) ? '\t' : (semis > commas ? ';' : ',')

  const rows: string[][] = []
  // Parser CSV minimaliste — gère les guillemets simples (pas les multi-lignes
  // imbriquées, suffisant pour les exports Sheets/Excel standards).
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue
    const cells: string[] = []
    let cur = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
        else inQuote = !inQuote
      } else if (c === sep && !inQuote) {
        cells.push(cur.trim())
        cur = ''
      } else {
        cur += c
      }
    }
    cells.push(cur.trim())
    rows.push(cells)
  }
  return rows
}

/** Identifie l'index de la colonne contenant des URLs.
 *  Stratégie : (1) header nommé "url"/"lien"/"link", sinon (2) colonne avec le
 *  plus grand ratio d'URLs http(s). */
function findUrlColumn(rows: string[][]): number {
  if (rows.length === 0) return -1
  const header = rows[0].map((c) => c.toLowerCase().trim())
  const namedIdx = header.findIndex((h) => /^(url|lien|link|web|adresse|hyperlien)\b/i.test(h))
  if (namedIdx >= 0) return namedIdx

  // Fallback : colonne avec le plus haut ratio d'URLs sur les lignes data
  const dataRows = rows.slice(1, Math.min(rows.length, 50))
  if (dataRows.length === 0) return -1
  const colCount = Math.max(...dataRows.map((r) => r.length))
  let bestIdx = -1
  let bestRatio = 0
  for (let i = 0; i < colCount; i++) {
    const matches = dataRows.filter((r) => /^https?:\/\//i.test(r[i] ?? '')).length
    const ratio = matches / dataRows.length
    if (ratio > bestRatio && ratio >= 0.5) {
      bestRatio = ratio
      bestIdx = i
    }
  }
  return bestIdx
}

/** Extrait les URLs d'un fichier Excel (.xlsx/.xls) ou CSV.
 *  Auto-détecte la colonne URL via header ou heuristique de contenu. */
export async function extractUrlsFromFile(file: File): Promise<string[]> {
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  let rows: string[][]

  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
    const text = await file.text()
    rows = parseCsv(text)
  } else if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm' || ext === 'ods') {
    const xlsx = await import('xlsx')
    const buf = await file.arrayBuffer()
    const wb = xlsx.read(buf, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    rows = xlsx.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' }) as string[][]
    rows = rows.map((r) => r.map((c) => String(c ?? '').trim()))
  } else {
    // Fallback : tente comme texte
    const text = await file.text()
    rows = parseCsv(text)
  }

  const urlCol = findUrlColumn(rows)
  if (urlCol < 0) {
    // Pas de colonne URL claire → tente de matcher dans tout le contenu
    const all = rows.map((r) => r.join(' ')).join('\n')
    return extractUrlsFromText(all)
  }
  // Skip header row — l'URL doit commencer par http
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of rows) {
    const cell = row[urlCol] ?? ''
    if (!/^https?:\/\//i.test(cell)) continue
    if (seen.has(cell)) continue
    seen.add(cell)
    out.push(cell)
  }
  return out
}

/** Télécharge un Google Sheet en CSV via Drive API et extrait les URLs.
 *  Réutilise le accessToken du store gdrive — l'utilisateur doit être connecté. */
export async function extractUrlsFromGoogleSheet(
  fileId: string,
  accessToken: string,
): Promise<string[]> {
  const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`
  const res = await fetch(exportUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    throw new Error(`Google Sheets export failed: HTTP ${res.status}`)
  }
  const csv = await res.text()
  const rows = parseCsv(csv)
  const urlCol = findUrlColumn(rows)
  if (urlCol < 0) {
    const all = rows.map((r) => r.join(' ')).join('\n')
    return extractUrlsFromText(all)
  }
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of rows) {
    const cell = row[urlCol] ?? ''
    if (!/^https?:\/\//i.test(cell)) continue
    if (seen.has(cell)) continue
    seen.add(cell)
    out.push(cell)
  }
  return out
}
