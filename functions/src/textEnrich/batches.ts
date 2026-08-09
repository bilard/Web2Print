// functions/src/textEnrich/batches.ts
// ⚠ COPIE de src/features/excel/ai-completion/columnCompletionEngine.ts (bundles séparés :
// `functions/` est hermétique). Le SCHÉMA zod en moins — zod n'est pas une dépendance des
// Cloud Functions, et la réponse y est validée par `parseLlmJson`. Le découpage, la
// cadence et les reprises, eux, sont identiques : c'est ce qui décide combien de fiches
// partent par appel, donc si la réponse tient dans le budget de sortie.
// Cf. textEnrichParity.test.ts.
import type { ExcelColumn, ExcelRow } from '../excel/types'

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

/** Mappe les résultats indexés du lot vers `{ rowId → valeur }`.
 * Lève une Error si un index est hors de la plage [0, chunk.length-1] — signale une
 * réponse LLM incohérente (ex. numérotation 1-based) qui pourrait écrire sur la mauvaise
 * ligne. Les index partiellement manquants (dans la plage mais absents) restent tolérés. */
/** Ce qu'un lot de complétion rend. Idem : type écrit, validation par `parseLlmJson`. */
export interface CompletionBatch {
  results: { i: number; v: string }[]
}

export function mapResults(parsed: CompletionBatch, chunk: ExcelRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { i, v } of parsed.results) {
    if (i < 0 || i >= chunk.length) {
      throw new Error('Indices de lot incohérents (réponse LLM hors plage)')
    }
    const row = chunk[i]
    if (!row) continue
    out[row._id] = v
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
  /**
   * Lots envoyés SIMULTANÉMENT. 1 par défaut — le comportement d'origine.
   *
   * ⚠ Un lot en vol à la fois plafonne le débit à la latence du modèle : mesuré en
   * production sur l'enrichissement de textes, 86 champs/minute, soit 57 heures pour
   * 204 000 champs. Or ces lots sont INDÉPENDANTS — rien ne justifiait de les attendre
   * l'un après l'autre. Reste borné : une rafale déclencherait les limites de débit du
   * fournisseur, et un échec massif coûte plus cher qu'une attente.
   */
  concurrency?: number
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
  const width = Math.max(1, Math.floor(deps.concurrency ?? 1))
  let consecutiveFailures = 0
  let doneChunks = 0

  /** Un lot, de bout en bout. Rend `false` si l'appel a échoué. */
  const runChunk = async (chunk: ExcelRow[]): Promise<boolean> => {
    const toSend: ExcelRow[] = []
    for (const row of chunk) {
      if (isRowEmpty(prompt, row, columns)) deps.onItem(row._id, 'skipped')
      else toSend.push(row)
    }
    if (toSend.length === 0) return true
    try {
      const results = await deps.callBatch(toSend)
      let anyDone = false
      for (const row of toSend) {
        if (Object.prototype.hasOwnProperty.call(results, row._id)) {
          deps.onItem(row._id, 'done', results[row._id])
          anyDone = true
        } else {
          deps.onItem(row._id, 'failed', undefined, 'Aucun résultat renvoyé pour cette ligne')
        }
      }
      return anyDone
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur'
      for (const row of toSend) deps.onItem(row._id, 'failed', undefined, msg)
      return false
    }
  }

  // ⚠ Par VAGUES, et l'abandon se décide ENTRE deux vagues : couper au milieu perdrait des
  // réponses déjà payées. À `concurrency: 1` — le défaut — la vague vaut un lot et le
  // comportement est celui d'avant, y compris l'ordre des rappels.
  for (let c = 0; c < chunks.length; c += width) {
    if (deps.abortRef.current) {
      for (let k = c; k < chunks.length; k++) for (const row of chunks[k]) deps.onItem(row._id, 'aborted')
      return
    }
    const wave = chunks.slice(c, c + width)
    const outcomes = await Promise.all(wave.map((chunk) => runChunk(chunk)))
    // ⚠ Trois vagues entièrement perdues d'affilée : le fournisseur est à terre ou la
    // clé est refusée. Insister coûterait sans rien produire.
    consecutiveFailures = outcomes.some(Boolean) ? 0 : consecutiveFailures + 1
    doneChunks += wave.length
    deps.onChunkDone?.(doneChunks - 1, chunks.length)
    if (consecutiveFailures >= 3) {
      for (let k = c + width; k < chunks.length; k++) for (const row of chunks[k]) deps.onItem(row._id, 'aborted')
      return
    }
    if (c + width < chunks.length && !deps.abortRef.current) await sleep(rateLimitMs)
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
