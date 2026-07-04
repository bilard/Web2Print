// src/features/excel/ai-image/useColumnImageGen.ts
// Hook de génération de visuels produits par IA pour une colonne image du PIM :
// prompt résolu par ligne → image (Nano Banana/Gemini ou Higgsfield) → upload DAM
// Google Drive (sous-dossier au nom du sheet) → webViewLink écrit dans la cellule.
import { useCallback, useRef, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'
import { useExcelStore } from '@/stores/excel.store'
import { recordAudit } from '@/lib/auditLog'
import { generateImageBase64 } from '@/features/nanobana/generateImageBase64'
import { uploadImageToDam, uploadUrlToDam, damSlug } from '@/features/dam/uploadImageToDam'
import { uniqueColumnKey } from '@/features/excel/ai-completion/columnCompletionEngine'
import type { ExcelColumn, ExcelRow } from '@/features/excel/types'
import { buildImageJobs, runImageGenQueue, type ImageGenJob, type ImageGenStatus } from './imageGenEngine'

export type ImageGenEngine = 'nano' | 'higgsfield'

export interface ImageGenItem {
  rowId: string
  status: ImageGenStatus
  value?: string
  error?: string
}

interface RunInput {
  engine: ImageGenEngine
  prompt: string
  rows: ExcelRow[]
  columns: ExcelColumn[]
  targetColKey: string
  onlyEmpty: boolean
  /** Sous-dossier DAM (nom du sheet). */
  subFolder: string
}

interface HiggsfieldAsset { url: string; type: 'image' | 'video'; mimeType: string; name: string }
const higgsfieldFn = httpsCallable<Record<string, unknown>, { assets: HiggsfieldAsset[] }>(
  functions, 'higgsfieldGenerate', { timeout: 540_000 },
)

/** Génère UNE image (sans upload) ; renvoie une source affichable (data: ou URL CDN). */
async function generateOne(engine: ImageGenEngine, prompt: string): Promise<{ src: string; ext: string }> {
  if (engine === 'higgsfield') {
    const { assets } = (await higgsfieldFn({
      mode: 'image', prompt, aspectRatio: '1:1', quality: '1080p', videoModel: 'dop-lite', batchSize: 1,
    })).data
    const img = assets.find((a) => a.type === 'image')
    if (!img) throw new Error('Higgsfield n\'a renvoyé aucune image')
    return { src: img.url, ext: (img.mimeType.split('/')[1] || 'jpg').replace('jpeg', 'jpg') }
  }
  const { mimeType, base64 } = await generateImageBase64({ prompt, aspectRatio: '1:1' })
  return { src: `data:${mimeType};base64,${base64}`, ext: (mimeType.split('/')[1] || 'png').replace('jpeg', 'jpg') }
}

/** Nom de fichier Drive : valeur de la colonne primaire (ou 1re colonne) + id court. */
function fileNameFor(row: ExcelRow, columns: ExcelColumn[], ext: string): string {
  const nameCol = columns.find((c) => c.isPrimary) ?? columns[0]
  const base = damSlug(String(row[nameCol?.key ?? ''] ?? '') || row._id)
  return `${base}_${row._id.slice(0, 6)}.${ext}`
}

export function useColumnImageGen() {
  const [items, setItems] = useState<ImageGenItem[]>([])
  const [running, setRunning] = useState(false)
  const abortRef = useRef({ current: false })

  /** Test sur 1 ligne : génère SANS uploader ni écrire ; renvoie la source affichable. */
  const runTest = useCallback(async (input: Omit<RunInput, 'subFolder'>): Promise<string> => {
    const jobs = buildImageJobs(input.rows, input.prompt, input.columns, input.targetColKey)
    const job = jobs.find((j) => j.prompt !== '' && (!input.onlyEmpty || !j.alreadyFilled))
    if (!job) throw new Error('Aucune ligne éligible (cellules déjà remplies ou colonnes référencées vides)')
    setRunning(true)
    try {
      return (await generateOne(input.engine, job.prompt)).src
    } finally {
      setRunning(false)
    }
  }, [])

  const runAll = useCallback(async (input: RunInput): Promise<void> => {
    setRunning(true)
    abortRef.current.current = false
    recordAudit({
      action: 'ai.imageGen', module: 'ai', targetLabel: input.targetColKey,
      meta: { rows: input.rows.length, engine: input.engine },
    })
    const rowById = new Map(input.rows.map((r) => [r._id, r]))
    const { activeSheetIndex, updateCell } = useExcelStore.getState()
    const jobs = buildImageJobs(input.rows, input.prompt, input.columns, input.targetColKey)
    setItems(jobs.map((j) => ({ rowId: j.rowId, status: 'aborted' as ImageGenStatus })))
    try {
      await runImageGenQueue(jobs, {
        abortRef: abortRef.current,
        concurrency: input.engine === 'higgsfield' ? 1 : 2,
        generateAndStore: async (job: ImageGenJob) => {
          const { src, ext } = await generateOne(input.engine, job.prompt)
          const row = rowById.get(job.rowId)
          const fileName = row ? fileNameFor(row, input.columns, ext) : `image_${job.rowId.slice(0, 6)}.${ext}`
          return src.startsWith('http')
            ? uploadUrlToDam(src, fileName, input.subFolder)
            : uploadImageToDam(src, fileName, input.subFolder)
        },
        onItem: (rowId, status, value, error) => {
          setItems((prev) => prev.map((it) => (it.rowId === rowId ? { rowId, status, value, error } : it)))
          if (status === 'done' && value !== undefined) {
            updateCell(activeSheetIndex, rowId, input.targetColKey, value)
          }
        },
      }, { onlyEmpty: input.onlyEmpty })
    } finally {
      setRunning(false)
    }
  }, [])

  /** Crée la colonne image cible si demandé ; retourne sa clé. */
  const ensureTargetColumn = useCallback((opts: { mode: 'new' | 'existing'; label: string; existingKey?: string }): string => {
    const { sheets, activeSheetIndex, addColumn } = useExcelStore.getState()
    if (opts.mode === 'existing' && opts.existingKey) return opts.existingKey
    const key = uniqueColumnKey(opts.label, sheets[activeSheetIndex]?.columns ?? [])
    addColumn(activeSheetIndex, {
      key, label: opts.label, fieldType: 'image', detectedType: 'image', isPrimary: false, width: 280,
    })
    return key
  }, [])

  const abort = useCallback(() => { abortRef.current.current = true }, [])

  return { items, running, runTest, runAll, abort, ensureTargetColumn }
}
