import { z } from 'zod'
import type { ExcelColumn, ExcelRow } from '@/features/excel/types'

/** Découpe un tableau en lots de `size`. */
export function buildChunks<T>(rows: T[], size = 20): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size))
  return chunks
}

/** Remplace les références `[Label]` ou `[key]` par la valeur de la ligne (vide si inconnue). */
export function resolveColumnRefs(prompt: string, row: ExcelRow, columns: ExcelColumn[]): string {
  return prompt.replace(/\[([^\]]+)\]/g, (_m, ref: string) => {
    const r = ref.trim()
    const col = columns.find((c) => c.label === r || c.key === r)
    if (!col) return ''
    const v = row[col.key]
    return v === null || v === undefined ? '' : String(v)
  })
}

/** Vrai si la résolution des références ne produit aucun texte non vide. */
export function isRowEmpty(prompt: string, row: ExcelRow, columns: ExcelColumn[]): boolean {
  return resolveColumnRefs(prompt, row, columns).trim().length === 0
}

/** Construit un prompt unique pour un lot : consigne + entrées numérotées 0..n-1. */
export function buildBatchPrompt(userPrompt: string, chunk: ExcelRow[], columns: ExcelColumn[]): string {
  const entries = chunk
    .map((row, i) => `${i}: ${resolveColumnRefs(userPrompt, row, columns)}`)
    .join('\n')
  return [
    `Pour CHAQUE entrée ci-dessous, applique la consigne et renvoie un résultat.`,
    `Consigne : ${userPrompt}`,
    `Réponds STRICTEMENT en JSON : {"results":[{"i":<index de l'entrée>,"v":"<résultat>"}]}.`,
    `Un objet par entrée, dans l'ordre, sans texte hors JSON.`,
    ``,
    `Entrées :`,
    entries,
  ].join('\n')
}

export const CompletionBatchSchema = z.object({
  results: z.array(z.object({ i: z.number(), v: z.string() })),
})
export type CompletionBatch = z.infer<typeof CompletionBatchSchema>

/** JSON Schema équivalent (Gemini responseSchema / Claude tool input_schema). */
export const COMPLETION_SCHEMA_FOR_LLM: Record<string, unknown> = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: { i: { type: 'number' }, v: { type: 'string' } },
        required: ['i', 'v'],
      },
    },
  },
  required: ['results'],
}

/** Mappe les résultats indexés du lot vers `{ rowId → valeur }`. */
export function mapResults(parsed: CompletionBatch, chunk: ExcelRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { i, v } of parsed.results) {
    const row = chunk[i]
    if (row) out[row._id] = v
  }
  return out
}

export type CompletionStatus = 'done' | 'failed' | 'skipped' | 'aborted'

export interface BatchRunDeps {
  callBatch: (chunk: ExcelRow[]) => Promise<Record<string, string>>
  onItem: (rowId: string, status: CompletionStatus, value?: string, error?: string) => void
  onChunkDone?: (index: number, total: number) => void
  abortRef: { current: boolean }
  rateLimitMs?: number
  sleep?: (ms: number) => Promise<void>
}

/**
 * Orchestration des lots, avec dépendances injectées (testable sans React ni réseau).
 * Filtre les lignes vides (skipped), appelle callBatch sur le reste, mappe les résultats
 * (done / failed), s'arrête proprement entre lots si abortRef devient true (aborted).
 */
export async function runCompletionBatches(
  rows: ExcelRow[],
  prompt: string,
  columns: ExcelColumn[],
  deps: BatchRunDeps,
  chunkSize = 20,
): Promise<void> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const rateLimitMs = deps.rateLimitMs ?? 300
  const chunks = buildChunks(rows, chunkSize)

  for (let c = 0; c < chunks.length; c++) {
    if (deps.abortRef.current) {
      for (let k = c; k < chunks.length; k++) for (const row of chunks[k]) deps.onItem(row._id, 'aborted')
      return
    }
    const chunk = chunks[c]
    const toSend: ExcelRow[] = []
    for (const row of chunk) {
      if (isRowEmpty(prompt, row, columns)) deps.onItem(row._id, 'skipped')
      else toSend.push(row)
    }

    if (toSend.length > 0) {
      try {
        const results = await deps.callBatch(toSend)
        for (const row of toSend) {
          if (Object.prototype.hasOwnProperty.call(results, row._id)) {
            deps.onItem(row._id, 'done', results[row._id])
          } else {
            deps.onItem(row._id, 'failed', undefined, 'Aucun résultat renvoyé pour cette ligne')
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erreur'
        for (const row of toSend) deps.onItem(row._id, 'failed', undefined, msg)
      }
    }

    deps.onChunkDone?.(c, chunks.length)
    if (c < chunks.length - 1 && !deps.abortRef.current) await sleep(rateLimitMs)
  }
}

/** Slug du label, garanti unique parmi les clés existantes (suffixe _2, _3…). */
export function uniqueColumnKey(label: string, existing: ExcelColumn[]): string {
  const base =
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'colonne'
  const keys = new Set(existing.map((c) => c.key))
  if (!keys.has(base)) return base
  let n = 2
  while (keys.has(`${base}_${n}`)) n++
  return `${base}_${n}`
}
