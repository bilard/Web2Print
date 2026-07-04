// src/features/excel/ai-image/imageGenEngine.ts
// Moteur PUR de génération de visuels produits par IA (testable sans React ni réseau).
// Construit un job par ligne (prompt résolu depuis les colonnes), puis exécute la file
// avec concurrence limitée, skip des cellules déjà remplies, circuit-breaker et abort.
// La génération + l'upload DAM sont injectés (deps.generateAndStore) — voir useColumnImageGen.
import type { ExcelColumn, ExcelRow } from '@/features/excel/types'
import { resolveColumnRefs } from '@/features/excel/ai-completion/columnCompletionEngine'

export type ImageGenStatus = 'done' | 'failed' | 'skipped' | 'aborted'

export interface ImageGenJob {
  rowId: string
  /** Prompt final (références [Colonne] résolues). Vide → skipped. */
  prompt: string
  /** La cellule cible contient déjà une valeur (skip si onlyEmpty). */
  alreadyFilled: boolean
}

/** Vrai si le gabarit contient des références et qu'AUCUNE ne résout en texte pour la ligne
 * (le texte statique du gabarit produirait sinon un visuel générique hors-sujet). */
function refsAllEmpty(template: string, row: ExcelRow, columns: ExcelColumn[]): boolean {
  const refs = template.match(/\[[^\]]+\]/g)
  if (!refs) return false
  return refs.every((ref) => resolveColumnRefs(ref, row, columns).trim() === '')
}

/** Construit un job par ligne : prompt résolu + état de la cellule cible. */
export function buildImageJobs(
  rows: ExcelRow[],
  promptTemplate: string,
  columns: ExcelColumn[],
  targetColKey: string,
): ImageGenJob[] {
  return rows.map((row) => {
    const v = row[targetColKey]
    return {
      rowId: row._id,
      prompt: refsAllEmpty(promptTemplate, row, columns) ? '' : resolveColumnRefs(promptTemplate, row, columns).trim(),
      alreadyFilled: v !== null && v !== undefined && String(v).trim() !== '',
    }
  })
}

export interface ImageGenDeps {
  /** Génère l'image du job et la stocke (DAM) ; renvoie le lien à écrire en cellule. */
  generateAndStore: (job: ImageGenJob) => Promise<string>
  onItem: (rowId: string, status: ImageGenStatus, value?: string, error?: string) => void
  abortRef: { current: boolean }
  /** Jobs traités en parallèle (défaut 2 — la génération d'image est lente et coûteuse). */
  concurrency?: number
  /** Échecs consécutifs avant abandon du reste (défaut 3). */
  maxConsecutiveFailures?: number
}

interface ImageGenRunOptions {
  /** true (défaut) = ne génère que si la cellule cible est vide. */
  onlyEmpty?: boolean
}

/**
 * Exécute la file de jobs : skip (cellule remplie si onlyEmpty, prompt vide), génération
 * via deps.generateAndStore avec `concurrency` workers, arrêt propre si abortRef passe à
 * true, circuit-breaker après N échecs consécutifs (le reste est marqué aborted).
 */
export async function runImageGenQueue(
  jobs: ImageGenJob[],
  deps: ImageGenDeps,
  opts: ImageGenRunOptions = {},
): Promise<void> {
  const onlyEmpty = opts.onlyEmpty ?? true
  const concurrency = Math.max(1, deps.concurrency ?? 2)
  const maxFailures = deps.maxConsecutiveFailures ?? 3

  const queue: ImageGenJob[] = []
  for (const job of jobs) {
    if (onlyEmpty && job.alreadyFilled) deps.onItem(job.rowId, 'skipped')
    else if (job.prompt === '') deps.onItem(job.rowId, 'skipped')
    else queue.push(job)
  }

  let next = 0
  let consecutiveFailures = 0
  let tripped = false // circuit-breaker déclenché → plus aucune génération

  const worker = async (): Promise<void> => {
    while (next < queue.length) {
      const job = queue[next++]
      if (deps.abortRef.current || tripped) {
        deps.onItem(job.rowId, 'aborted')
        continue
      }
      try {
        const value = await deps.generateAndStore(job)
        consecutiveFailures = 0
        deps.onItem(job.rowId, 'done', value)
      } catch (e) {
        consecutiveFailures++
        deps.onItem(job.rowId, 'failed', undefined, e instanceof Error ? e.message : 'Erreur')
        if (consecutiveFailures >= maxFailures) tripped = true
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
}
