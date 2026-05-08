// src/features/gdrive/gdriveCore.ts
// Helpers non-React pour l'API Google Drive / Google Sheets, utilisés par les
// nodes de workflow. Lecture (drive.readonly) ET écriture (drive.file) supposées
// granted via le flow OAuth de useGoogleDrive / useGoogleSheetsImport.

import * as XLSX from 'xlsx'
import type { ExcelSheet } from '@/features/excel/types'
import { parseExcelFile } from '@/features/excel/useExcelImport'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

const SHEETS_MIME = 'application/vnd.google-apps.spreadsheet'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export interface DriveFileMeta {
  id: string
  name: string
  mimeType: string
  webViewLink?: string
}

export class GoogleAuthMissingError extends Error {
  constructor(msg = 'Google Drive non connecté — connectez-vous depuis le panneau Google Drive avant de lancer ce node.') {
    super(msg)
    this.name = 'GoogleAuthMissingError'
  }
}

/** Extrait l'ID Drive/Sheets depuis une URL ou retourne la chaîne brute si elle
 *  ressemble déjà à un ID (≥ 20 caractères alphanumériques + tirets/underscores). */
export function extractDriveId(input: string): string | null {
  const s = input.trim()
  if (!s) return null
  // Format : https://docs.google.com/spreadsheets/d/<ID>/edit ou /document/d/<ID>
  const docMatch = s.match(/\/d\/([a-zA-Z0-9_-]{20,})/)
  if (docMatch) return docMatch[1]
  // Format : https://drive.google.com/file/d/<ID>/view
  const fileMatch = s.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/)
  if (fileMatch) return fileMatch[1]
  // Format : https://drive.google.com/open?id=<ID>
  const idParam = s.match(/[?&]id=([a-zA-Z0-9_-]{20,})/)
  if (idParam) return idParam[1]
  // ID brut
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s
  return null
}

/** Récupère les métadonnées d'un fichier Drive. */
export async function getDriveFileMeta(fileId: string, token: string): Promise<DriveFileMeta> {
  const params = new URLSearchParams({ fields: 'id,name,mimeType,webViewLink' })
  const res = await fetch(`${DRIVE_API}/files/${fileId}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Drive : impossible de lire le fichier ${fileId} (HTTP ${res.status}${detail ? ` — ${detail.slice(0, 120)}` : ''})`)
  }
  return (await res.json()) as DriveFileMeta
}

/** Télécharge un fichier Drive en File. Pour un Google Sheets, exporte en XLSX
 *  (Drive convertit automatiquement). Pour un fichier "natif" (PDF, image…),
 *  télécharge le binaire via alt=media. */
export async function downloadDriveFile(fileId: string, token: string): Promise<File> {
  const meta = await getDriveFileMeta(fileId, token)

  let blob: Blob
  let filename = meta.name
  let mime = meta.mimeType

  if (meta.mimeType === SHEETS_MIME) {
    // Google Sheets → export XLSX
    const res = await fetch(
      `${DRIVE_API}/files/${fileId}/export?mimeType=${encodeURIComponent(XLSX_MIME)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) {
      throw new Error(`Drive : export GSheet échoué (HTTP ${res.status})`)
    }
    blob = await res.blob()
    if (!/\.xlsx$/i.test(filename)) filename = `${filename}.xlsx`
    mime = XLSX_MIME
  } else if (meta.mimeType.startsWith('application/vnd.google-apps.')) {
    throw new Error(
      `Drive : le type natif Google "${meta.mimeType}" n'est pas supporté en download direct. Utilisez "Import GSheet" pour les Sheets.`,
    )
  } else {
    const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      throw new Error(`Drive : download échoué (HTTP ${res.status})`)
    }
    blob = await res.blob()
  }

  return new File([blob], filename, { type: mime })
}

/** Importe un Google Sheet par ID → ExcelSheet (premier onglet). */
export async function importGoogleSheetById(sheetId: string, token: string): Promise<ExcelSheet[]> {
  const meta = await getDriveFileMeta(sheetId, token)
  if (meta.mimeType !== SHEETS_MIME) {
    throw new Error(`Le fichier ${meta.name} n'est pas un Google Sheets (mimeType=${meta.mimeType}).`)
  }
  const res = await fetch(
    `${DRIVE_API}/files/${sheetId}/export?mimeType=${encodeURIComponent(XLSX_MIME)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) {
    throw new Error(`Drive : export GSheet "${meta.name}" échoué (HTTP ${res.status})`)
  }
  const blob = await res.blob()
  const file = new File([blob], `${meta.name}.xlsx`, { type: XLSX_MIME })
  const sheets = await parseExcelFile(file)
  if (sheets.length === 0) {
    throw new Error(`Le Google Sheet "${meta.name}" est vide.`)
  }
  return sheets
}

/** Construit un blob XLSX depuis une ExcelSheet (single-sheet workbook). */
function sheetToXlsxBlob(sheet: ExcelSheet, sheetName: string): Blob {
  const rows = sheet.rows.map((row) => {
    const out: Record<string, unknown> = {}
    for (const col of sheet.columns) {
      out[col.label || col.key] = row[col.key]
    }
    return out
  })
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || 'Sheet1')
  const data = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
  return new Blob([new Uint8Array(data)], { type: XLSX_MIME })
}

/** Upload multipart vers Drive. Retourne la metadata du fichier créé.
 *  - `convertToSheets=true` → Drive convertit le XLSX uploadé en Google Sheets natif. */
export async function uploadToDrive(
  token: string,
  body: Blob,
  options: {
    name: string
    parentFolderId?: string
    convertToSheets?: boolean
    sourceMimeType: string
  },
): Promise<DriveFileMeta> {
  const targetMime = options.convertToSheets ? SHEETS_MIME : options.sourceMimeType
  const metadata: Record<string, unknown> = { name: options.name, mimeType: targetMime }
  if (options.parentFolderId) metadata.parents = [options.parentFolderId]

  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const metadataPart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n`
  const dataHeader =
    `--${boundary}\r\n` +
    `Content-Type: ${options.sourceMimeType}\r\n\r\n`
  const closingBoundary = `\r\n--${boundary}--`

  const buffer = await body.arrayBuffer()
  const multipartBody = new Blob(
    [metadataPart, dataHeader, buffer, closingBoundary],
    { type: `multipart/related; boundary=${boundary}` },
  )

  const params = new URLSearchParams({ uploadType: 'multipart', fields: 'id,name,mimeType,webViewLink' })
  const res = await fetch(`${DRIVE_UPLOAD}/files?${params}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Drive : permission refusée (HTTP ${res.status}). Reconnectez-vous via le panneau Google Drive — le scope d'écriture (drive.file) est requis.`,
      )
    }
    throw new Error(`Drive : upload échoué (HTTP ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ''})`)
  }
  return (await res.json()) as DriveFileMeta
}

/** Crée un Google Sheets depuis une ExcelSheet workflow.
 *  Workflow : XLSX en mémoire → upload Drive avec mimeType cible Sheets → Drive
 *  convertit automatiquement. */
export async function exportSheetToGoogleSheets(
  token: string,
  sheet: ExcelSheet,
  options: { name: string; parentFolderId?: string },
): Promise<DriveFileMeta> {
  const blob = sheetToXlsxBlob(sheet, sheet.name || 'Sheet1')
  return uploadToDrive(token, blob, {
    name: options.name,
    parentFolderId: options.parentFolderId,
    convertToSheets: true,
    sourceMimeType: XLSX_MIME,
  })
}

/** Upload arbitraire d'un File (image, PDF, etc.) vers Drive sans conversion. */
export async function uploadFileToDrive(
  token: string,
  file: File | Blob,
  options: { name: string; parentFolderId?: string },
): Promise<DriveFileMeta> {
  const sourceMimeType = file.type || 'application/octet-stream'
  return uploadToDrive(token, file, {
    name: options.name,
    parentFolderId: options.parentFolderId,
    convertToSheets: false,
    sourceMimeType,
  })
}
