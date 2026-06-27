// src/features/dam/useDamMigration.ts
// Centralise les images d'une feuille dans le DAM (Google Drive) : pour chaque
// cellule de colonne `image` (ou `url` dont la valeur ressemble à une image),
// télécharge les octets via le proxy serveur `imageProxy` (contourne CORS), les
// upload dans le dossier DAM, puis réécrit la cellule avec le(s) webViewLink(s)
// Drive (référence stable, ré-résolue à l'affichage par driveAssets). Sert M1
// (images scrapées) ET M3 (centralisation générale).
//
// IMPORTANT : une cellule image peut contenir PLUSIEURS URLs jointes (galerie) —
// `\n` (enrichissement) ou ` | ` (scrape). On découpe, on migre chaque image,
// puis on recolle (lien Drive si migré, valeur d'origine sinon) avec le même
// séparateur. Robuste aux chemins relatifs (absolutise via sheet.sourceUrl ou
// l'origine d'une URL absolue de la ligne) et aux entités HTML (`&amp;`).
import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'
import { useExcelStore } from '@/stores/excel.store'
import { uploadFileToDrive } from '@/features/gdrive/gdriveCore'
import { ensureDamFolder } from './damFolder'
import { getDriveAccessToken, isDriveImageRef, driveWebViewLink } from './driveAssets'
import type { ExcelRow } from '@/features/excel/types'

const imageProxy = httpsCallable<{ url: string }, { data: string; mimeType: string }>(functions, 'imageProxy')

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const UPLOAD_CONCURRENCY = 4

const IMG_EXT_RE = /\.(jpe?g|png|webp|gif|avif|svg)(\?|#|$)/i
const IMG_CDN_RE = /scene7\.com|cloudinary\.com|imgix\.net|akamaized\.net|cdninstagram|fbcdn\.net|\/is\/image\/|\/image\/upload\/|\/remote\.axd\//i

function looksLikeImage(v: string): boolean {
  return IMG_EXT_RE.test(v) || IMG_CDN_RE.test(v)
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/gi, '&').replace(/&#0*38;/g, '&').replace(/&#x0*26;/gi, '&')
}

/** Découpe une cellule multi-images en tokens + séparateur d'origine. */
function splitCell(v: string): { sep: string; tokens: string[] } {
  if (v.includes('\n')) return { sep: '\n', tokens: v.split('\n') }
  if (v.includes(' | ')) return { sep: ' | ', tokens: v.split(' | ') }
  return { sep: '\n', tokens: [v] }
}

function originOf(u: string): string | null {
  try { return new URL(u).origin } catch { return null }
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function sanitize(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_').trim().slice(0, 60) || 'asset'
}

/** Résout une URL (éventuellement relative) en absolue, ou null si impossible. */
function toAbsolute(value: string, row: ExcelRow, sheetSourceUrl: string | undefined): string | null {
  if (/^https?:\/\//i.test(value)) return value
  let base = sheetSourceUrl ?? null
  if (!base) {
    for (const k of Object.keys(row)) {
      const rv = row[k]
      if (typeof rv === 'string' && /^https?:\/\//i.test(rv)) { base = originOf(rv); if (base) break }
    }
  }
  if (!base) return null
  try { return new URL(value, base).toString() } catch { return null }
}

interface CellDesc { rowId: string; colKey: string; sep: string; tokens: string[]; rowLabel: string }
interface ImgJob { cellIdx: number; tokenIdx: number; url: string }

export function useDamMigration() {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const migrateActiveSheet = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true
    const { sheets, activeSheetIndex, setSheets } = useExcelStore.getState()
    const sheet = sheets[activeSheetIndex]
    if (!sheet) return

    const candidateCols = sheet.columns.filter((c) => c.fieldType === 'image' || c.fieldType === 'url')
    if (candidateCols.length === 0) {
      if (!silent) toast.info('Aucune colonne image ou URL dans cette feuille.')
      return
    }

    const primaryKey = sheet.columns.find((c) => c.isPrimary)?.key
    const cells: CellDesc[] = []
    const jobs: ImgJob[] = []
    let skippedRelative = 0

    sheet.rows.forEach((row) => {
      const rowLabel = primaryKey && typeof row[primaryKey] === 'string' ? String(row[primaryKey]) : 'asset'
      for (const col of candidateCols) {
        const v = row[col.key]
        if (typeof v !== 'string' || !v) continue
        const { sep, tokens } = splitCell(v)
        const cellIdx = cells.length
        let anyJob = false
        tokens.forEach((tokRaw, tokenIdx) => {
          const tok = decodeEntities(tokRaw.trim())
          if (!tok || isDriveImageRef(tok)) return
          if (col.fieldType !== 'image' && !looksLikeImage(tok)) return
          const abs = toAbsolute(tok, row, sheet.sourceUrl)
          if (!abs) { skippedRelative++; return }
          jobs.push({ cellIdx, tokenIdx, url: abs })
          anyJob = true
        })
        if (anyJob) cells.push({ rowId: row._id, colKey: col.key, sep, tokens: [...tokens], rowLabel })
      }
    })

    if (jobs.length === 0) {
      if (!silent) {
        toast.info(
          skippedRelative > 0
            ? 'Images en chemin relatif sans URL source connue — re-scrape pour obtenir des liens absolus.'
            : 'Toutes les images sont déjà dans le DAM.',
        )
      }
      return
    }

    setRunning(true)
    setProgress({ done: 0, total: jobs.length })

    let token: string
    let folderId: string
    try {
      token = await getDriveAccessToken()
      folderId = await ensureDamFolder(token)
    } catch (e) {
      toast.error(`DAM : ${e instanceof Error ? e.message : 'connexion Google requise'}`)
      setRunning(false)
      setProgress(null)
      return
    }

    let done = 0
    let failed = 0
    let cursor = 0
    let firstError = ''
    let firstFailUrl = ''

    const worker = async (): Promise<void> => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++]
        try {
          const { data, mimeType } = (await imageProxy({ url: job.url })).data
          const ext = EXT_BY_MIME[mimeType] ?? 'jpg'
          const cell = cells[job.cellIdx]
          const name = `${sanitize(cell.rowLabel)}_${job.cellIdx}_${job.tokenIdx}.${ext}`
          const file = new File([base64ToBlob(data, mimeType)], name, { type: mimeType })
          const meta = await uploadFileToDrive(token, file, { name, parentFolderId: folderId })
          cell.tokens[job.tokenIdx] = driveWebViewLink(meta.id)
        } catch (e) {
          failed++
          if (!firstError) { firstError = e instanceof Error ? e.message : String(e); firstFailUrl = job.url }
          console.error('[DAM] échec image', job.url, e)
        }
        done++
        setProgress({ done, total: jobs.length })
      }
    }

    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, jobs.length) }, worker))

    // Réécrit les cellules migrées (lien Drive par token muté ; on conserve TOUTES
    // les feuilles — jamais d'écrasement).
    const { sheets: cur, activeSheetIndex: curIdx } = useExcelStore.getState()
    const target = cur[curIdx]
    if (target) {
      const byRow = new Map<string, CellDesc[]>()
      for (const c of cells) {
        const arr = byRow.get(c.rowId) ?? []
        arr.push(c)
        byRow.set(c.rowId, arr)
      }
      const updatedRows = target.rows.map((row) => {
        const cs = byRow.get(row._id)
        if (!cs) return row
        const next = { ...row }
        for (const c of cs) {
          const newVal = c.tokens.join(c.sep)
          if (newVal !== row[c.colKey]) next[c.colKey] = newVal
        }
        return next
      })
      const nextSheets = cur.map((s, i) => (i === curIdx ? { ...target, rows: updatedRows } : s))
      setSheets(nextSheets)
    }

    setRunning(false)
    setProgress(null)
    const ok = jobs.length - failed
    const shortUrl = firstFailUrl ? firstFailUrl.replace(/^https?:\/\//, '').slice(0, 70) : ''
    if (failed === 0) {
      toast.success(`${ok} image(s) centralisée(s) dans le DAM. Pense à sauvegarder.`)
    } else if (ok === 0) {
      toast.error(`Échec centralisation${firstError ? ` : ${firstError}` : ''}${shortUrl ? `\nURL : …${shortUrl}` : ''}`)
    } else {
      toast.warning(`${ok} centralisée(s), ${failed} échec(s)${firstError ? ` — ${firstError}` : ''}. Pense à sauvegarder.`)
    }
  }, [])

  return { migrateActiveSheet, running, progress }
}
