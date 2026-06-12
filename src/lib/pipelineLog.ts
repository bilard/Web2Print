// src/lib/pipelineLog.ts
// Observabilité des pipelines longs (enrichissement PIM, décomposition
// Image/PDF→SVG) : chaque run écrit son issue + ses dernières étapes dans
// Firestore `pipelineRuns` — l'« étage logs prod » du diagnostic, sans devoir
// reproduire le problème en local. Fire-and-forget : un échec d'écriture ne
// doit jamais perturber le pipeline lui-même.
import { addDoc, collection } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'

type PipelineModule = 'enrichment' | 'decompose'

export interface PipelineRunInput {
  module: PipelineModule
  /** Identifiant lisible du run (titre produit, nom de fichier…). */
  label: string
  status: 'success' | 'error'
  durationMs: number
  error?: string
  /** Étapes du run (logs) — tronquées avant écriture. */
  steps?: string[]
  /** Contexte additionnel léger (compteurs, provider…). */
  meta?: Record<string, unknown>
}

export const MAX_STEPS = 40
export const MAX_STEP_CHARS = 300
const MAX_ERROR_CHARS = 500

/** Construit le document Firestore (pur, testable) : tronque les étapes aux
 *  MAX_STEPS dernières (le début d'un long run diagnostique moins que la fin)
 *  et borne chaque champ texte. */
export function buildPipelineRunDoc(run: PipelineRunInput, ownerId: string, now: number): Record<string, unknown> {
  const steps = (run.steps ?? [])
    .slice(-MAX_STEPS)
    .map((s) => (s.length > MAX_STEP_CHARS ? `${s.slice(0, MAX_STEP_CHARS)}…` : s))
  return {
    ownerId,
    module: run.module,
    label: run.label.slice(0, 200),
    status: run.status,
    durationMs: Math.round(run.durationMs),
    ...(run.error ? { error: run.error.slice(0, MAX_ERROR_CHARS) } : {}),
    steps,
    ...(run.meta ? { meta: run.meta } : {}),
    createdAt: now,
  }
}

export function recordPipelineRun(run: PipelineRunInput): void {
  const ownerId = useAuthStore.getState().user?.uid
  if (!ownerId) return
  addDoc(collection(db, 'pipelineRuns'), buildPipelineRunDoc(run, ownerId, Date.now()))
    .catch((e) => console.warn('[pipelineLog] écriture échouée :', e))
}
