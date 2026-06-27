// src/features/dam/useDamMigration.ts
// Centralise les images d'une feuille dans le DAM (Google Drive) : pour chaque
// cellule d'une colonne `image` (ou `url` dont la valeur ressemble à une image)
// contenant une URL externe, télécharge les octets via le proxy serveur
// `imageProxy` (contourne CORS), les upload dans le dossier DAM, puis réécrit la
// cellule avec le webViewLink Drive (référence stable, ré-résolue à l'affichage
// par driveAssets). Sert M1 (images scrapées) ET M3 (centralisation générale).
// Robuste aux chemins relatifs : absolutise via sheet.sourceUrl ou l'origine
// d'une URL absolue trouvée dans la même ligne.
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
const IMG_CDN_RE = /scene7\.com|cloudinary\.com|imgix\.net|akamaized\.net|cdninstagram|fbcdn\.net|\/is\/image\/|\/image\/upload\//i

/** Une valeur de colonne URL ne doit être migrée que si elle ressemble à une image. */
function looksLikeImage(v: string): boolean {
  return IMG_EXT_RE.test(v) || IMG_CDN_RE.test(v)
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

interface MigrationJob {
  rowId: string
  colKey: string
  url: string
  name: string
}

/** Résout une valeur image en URL absolue, ou null si impossible (relative sans base). */
function toAbsolute(value: string, row: ExcelRow, sheetSourceUrl: string | undefined): string | null {
  if (/^https?:\/\//i.test(value)) return value
  // Base : URL source du scrape, sinon origine d'une URL absolue de la même ligne.
  let base = sheetSourceUrl ?? null
  if (!base) {
    for (const k of Object.keys(row)) {
      const rv = row[k]
      if (typeof rv === 'string' && /^https?:\/\//i.test(rv)) {
        base = originOf(rv)
        if (base) break
      }
    }
  }
  if (!base) return null
  try { return new URL(value, base).toString() } catch { return null }
}

export function useDamMigration() {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const migrateActiveSheet = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true
    const { sheets, activeSheetIndex, setSheets } = useExcelStore.getState()
    const sheet = sheets[activeSheetIndex]
    if (!sheet) return

    // Colonnes candidates : type image (toute valeur) + type url (valeurs image-like).
    const candidateCols = sheet.columns.filter((c) => c.fieldType === 'image' || c.fieldType === 'url')
    if (candidateCols.length === 0) {
      if (!silent) toast.info('Aucune colonne image ou URL dans cette feuille.')
      return
    }

    const primaryKey = sheet.columns.find((c) => c.isPrimary)?.key
    const jobs: MigrationJob[] = []
    let skippedRelative = 0
    sheet.rows.forEach((row, idx) => {
      for (const col of candidateCols) {
        const v = row[col.key]
        if (typeof v !== 'string' || !v || isDriveImageRef(v)) continue
        if (col.fieldType !== 'image' && !looksLikeImage(v)) continue
        const abs = toAbsolute(v, row, sheet.sourceUrl)
        if (!abs) { skippedRelative++; continue }
        const pname = primaryKey && typeof row[primaryKey] === 'string' ? String(row[primaryKey]) : 'asset'
        jobs.push({ rowId: row._id, colKey: col.key, url: abs, name: `${pname}_${idx}_${col.key}` })
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

    const results = new Map<string, string>() // `${rowId}|${colKey}` → webViewLink
    let done = 0
    let failed = 0
    let cursor = 0
    let firstError = ''

    const worker = async (): Promise<void> => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++]
        try {
          const { data, mimeType } = (await imageProxy({ url: job.url })).data
          const ext = EXT_BY_MIME[mimeType] ?? 'jpg'
          const file = new File([base64ToBlob(data, mimeType)], `${sanitize(job.name)}.${ext}`, { type: mimeType })
          const meta = await uploadFileToDrive(token, file, { name: file.name, parentFolderId: folderId })
          results.set(`${job.rowId}|${job.colKey}`, driveWebViewLink(meta.id))
        } catch (e) {
          failed++
          if (!firstError) firstError = e instanceof Error ? e.message : String(e)
          console.error('[DAM] échec image', job.url, e)
        }
        done++
        setProgress({ done, total: jobs.length })
      }
    }

    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, jobs.length) }, worker))

    // Réécrit les cellules migrées — on conserve TOUTES les feuilles (jamais d'écrasement).
    if (results.size > 0) {
      const { sheets: cur, activeSheetIndex: curIdx } = useExcelStore.getState()
      const target = cur[curIdx]
      if (target) {
        const updatedRows = target.rows.map((row) => {
          let changed = false
          const next = { ...row }
          for (const col of candidateCols) {
            const link = results.get(`${row._id}|${col.key}`)
            if (link) {
              next[col.key] = link
              changed = true
            }
          }
          return changed ? next : row
        })
        const nextSheets = cur.map((s, i) => (i === curIdx ? { ...target, rows: updatedRows } : s))
        setSheets(nextSheets)
      }
    }

    setRunning(false)
    setProgress(null)
    if (failed === 0) {
      toast.success(`${results.size} image(s) centralisée(s) dans le DAM. Pense à sauvegarder.`)
    } else if (results.size === 0) {
      toast.error(`Échec de la centralisation${firstError ? ` : ${firstError}` : ''} (image inaccessible côté serveur).`)
    } else {
      toast.warning(`${results.size} centralisée(s), ${failed} échec(s)${firstError ? ` — ${firstError}` : ''}. Pense à sauvegarder.`)
    }
  }, [])

  return { migrateActiveSheet, running, progress }
}
