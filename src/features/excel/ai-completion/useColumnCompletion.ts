import { useCallback, useRef, useState } from 'react'
import { useExcelStore } from '@/stores/excel.store'
import { generateJson } from '@/features/ai/llmRouter'
import { recordAudit } from '@/lib/auditLog'
import type { ExcelColumn, ExcelRow } from '@/features/excel/types'
import {
  buildBatchPrompt, mapResults, runCompletionBatches, uniqueColumnKey,
  CompletionBatchSchema, COMPLETION_SCHEMA_FOR_LLM,
  type CompletionStatus,
} from './columnCompletionEngine'

export interface CompletionItem {
  rowId: string
  status: CompletionStatus
  value?: string
  error?: string
}

interface RunInput {
  prompt: string
  rows: ExcelRow[]
  columns: ExcelColumn[]
  targetColKey: string
  write: boolean // true = écrit dans le store (runAll) ; false = aperçu
}

const PREVIEW_COUNT = 5

async function callBatchLLM(
  prompt: string, chunk: ExcelRow[], columns: ExcelColumn[],
): Promise<Record<string, string>> {
  const parsed = await generateJson({
    task: 'data.columnCompletion',
    prompt: buildBatchPrompt(prompt, chunk, columns),
    schema: CompletionBatchSchema,
    schemaForLLM: COMPLETION_SCHEMA_FOR_LLM,
    version: 'column-completion-v1',
  })
  return mapResults(parsed, chunk)
}

export function useColumnCompletion() {
  const [items, setItems] = useState<CompletionItem[]>([])
  const [running, setRunning] = useState(false)
  const abortRef = useRef({ current: false })

  const run = useCallback(async (input: RunInput): Promise<void> => {
    setRunning(true)
    recordAudit({ action: 'ai.completion', module: 'ai', targetLabel: input.targetColKey, meta: { rows: input.rows.length } })
    abortRef.current.current = false
    setItems(input.rows.map((r) => ({ rowId: r._id, status: 'failed' as CompletionStatus })))
    const { activeSheetIndex } = useExcelStore.getState()
    const sheetIdx = activeSheetIndex
    const updateCell = useExcelStore.getState().updateCell
    try {
      await runCompletionBatches(input.rows, input.prompt, input.columns, {
        callBatch: (chunk) => callBatchLLM(input.prompt, chunk, input.columns),
        abortRef: abortRef.current,
        onItem: (rowId, status, value, error) => {
          setItems((prev) => prev.map((it) => (it.rowId === rowId ? { rowId, status, value, error } : it)))
          if (input.write && status === 'done' && value !== undefined) {
            updateCell(sheetIdx, rowId, input.targetColKey, value)
          }
        },
      })
    } finally {
      setRunning(false)
    }
  }, [])

  /** Crée la colonne cible si demandé ; retourne sa clé. */
  const ensureTargetColumn = useCallback((opts: { mode: 'new' | 'existing'; label: string; existingKey?: string }): string => {
    const { sheets, activeSheetIndex, addColumn } = useExcelStore.getState()
    const sheet = sheets[activeSheetIndex]
    if (opts.mode === 'existing' && opts.existingKey) return opts.existingKey
    const key = uniqueColumnKey(opts.label, sheet?.columns ?? [])
    addColumn(activeSheetIndex, {
      key, label: opts.label, fieldType: 'text', detectedType: 'text', isPrimary: false, width: 240,
    })
    return key
  }, [])

  const runPreview = useCallback((p: { prompt: string; rows: ExcelRow[]; columns: ExcelColumn[] }) =>
    run({ ...p, rows: p.rows.slice(0, PREVIEW_COUNT), targetColKey: '__preview__', write: false }), [run])

  const runAll = useCallback((p: RunInput) => run(p), [run])

  const abort = useCallback(() => { abortRef.current.current = true }, [])

  return { items, running, runPreview, runAll, abort, ensureTargetColumn }
}
