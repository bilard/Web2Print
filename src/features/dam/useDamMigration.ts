// src/features/dam/useDamMigration.ts
// Centralise les images d'une feuille dans le DAM (Google Drive) : pour chaque
// cellule de colonne `image` contenant une URL CDN brute (scraping, import, IA),
// télécharge les octets via le proxy serveur `imageProxy` (contourne CORS), les
// upload dans le dossier DAM, puis réécrit la cellule avec le webViewLink Drive
// (référence stable, ré-résolue à l'affichage par driveAssets). Sert M1 (images
// scrapées) ET M3 (centralisation générale). Action EXPLICITE (un clic) : pas
// d'upload silencieux à chaque scrape (coût/latence/token requis).
import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'
import { useExcelStore } from '@/stores/excel.store'
import { uploadFileToDrive } from '@/features/gdrive/gdriveCore'
import { ensureDamFolder } from './damFolder'
import { getDriveAccessToken, isDriveImageRef, driveWebViewLink } from './driveAssets'

const imageProxy = httpsCallable<{ url: string }, { data: string; mimeType: string }>(functions, 'imageProxy')

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const UPLOAD_CONCURRENCY = 4

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/** URL CDN brute (≠ déjà un asset Drive, ≠ asset Firebase nommé). */
function isCdnImageUrl(v: unknown): v is string {
  return typeof v === 'string' && /^https?:\/\//.test(v) && !isDriveImageRef(v)
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

export function useDamMigration() {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const migrateActiveSheet = useCallback(async () => {
    const { sheets, activeSheetIndex, setSheets } = useExcelStore.getState()
    const sheet = sheets[activeSheetIndex]
    if (!sheet) return

    const imageCols = sheet.columns.filter((c) => c.fieldType === 'image')
    if (imageCols.length === 0) {
      toast.info('Aucune colonne « image » dans cette feuille.')
      return
    }

    // Collecte des cellules à migrer (URLs CDN non encore dans le DAM).
    const primaryKey = sheet.columns.find((c) => c.isPrimary)?.key
    const jobs: MigrationJob[] = []
    sheet.rows.forEach((row, idx) => {
      for (const col of imageCols) {
        const v = row[col.key]
        if (!isCdnImageUrl(v)) continue
        const base = primaryKey && typeof row[primaryKey] === 'string' ? String(row[primaryKey]) : 'asset'
        jobs.push({ rowId: row._id, colKey: col.key, url: v, name: `${base}_${idx}_${col.key}` })
      }
    })
    if (jobs.length === 0) {
      toast.info('Toutes les images sont déjà dans le DAM.')
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

    const worker = async (): Promise<void> => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++]
        try {
          const { data, mimeType } = (await imageProxy({ url: job.url })).data
          const ext = EXT_BY_MIME[mimeType] ?? 'jpg'
          const file = new File([base64ToBlob(data, mimeType)], `${sanitize(job.name)}.${ext}`, { type: mimeType })
          const meta = await uploadFileToDrive(token, file, { name: file.name, parentFolderId: folderId })
          results.set(`${job.rowId}|${job.colKey}`, driveWebViewLink(meta.id))
        } catch {
          failed++
        }
        done++
        setProgress({ done, total: jobs.length })
      }
    }

    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, jobs.length) }, worker))

    // Réécrit les cellules migrées — on conserve TOUTES les feuilles (jamais d'écrasement).
    if (results.size > 0) {
      const updatedRows = sheet.rows.map((row) => {
        let changed = false
        const next = { ...row }
        for (const col of imageCols) {
          const link = results.get(`${row._id}|${col.key}`)
          if (link) {
            next[col.key] = link
            changed = true
          }
        }
        return changed ? next : row
      })
      const nextSheets = sheets.map((s, i) => (i === activeSheetIndex ? { ...sheet, rows: updatedRows } : s))
      setSheets(nextSheets)
    }

    setRunning(false)
    setProgress(null)
    if (failed === 0) {
      toast.success(`${results.size} image(s) centralisée(s) dans le DAM. Pense à sauvegarder.`)
    } else {
      toast.warning(`${results.size} image(s) centralisée(s), ${failed} échec(s). Pense à sauvegarder.`)
    }
  }, [])

  return { migrateActiveSheet, running, progress }
}
