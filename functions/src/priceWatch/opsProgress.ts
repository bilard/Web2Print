// functions/src/priceWatch/opsProgress.ts
// Jumeau SERVEUR de `src/features/priceWatch/ops/progressStore.ts`. Toute modification
// ici doit être faite là-bas — le test de parité échoue sinon, et c'est son rôle.
import { getFirestore } from 'firebase-admin/firestore'
import type { EnrichKind } from '../textEnrich/revision'
import { opsProgressDoc } from './paths'

export const OPS_WRITE_INTERVAL_MS = 10_000

export interface TextsProgress {
  considered: number
  alreadyDone: number
  pending: Partial<Record<EnrichKind, number>>
  byLang?: { lang: string | null; count: number }[]
  reasons?: { fresh: number; stale: number }
  stoppedBy?: 'spend' | 'deadline' | 'units'
  done: number
  total: number
  startedAt: number
  beatAt: number
  origin: 'client' | 'server'
}

export function shouldPublish(lastAt: number, now: number, force: boolean): boolean {
  return force || lastAt === 0 || now - lastAt >= OPS_WRITE_INTERVAL_MS
}

const lastAtByWatch = new Map<string, number>()

export async function publishTextsProgress(
  uid: string, watchId: string, texts: TextsProgress, opts: { force?: boolean } = {},
): Promise<void> {
  const now = Date.now()
  if (!shouldPublish(lastAtByWatch.get(watchId) ?? 0, now, opts.force === true)) return
  lastAtByWatch.set(watchId, now)
  try {
    await getFirestore()
      .doc(opsProgressDoc(uid, watchId))
      .set({ updatedAt: now, texts }, { merge: true })
  } catch (e) {
    console.warn('[suivi] publication de l’avancement refusée :', e)
  }
}

export function resetPublishThrottle(watchId: string): void { lastAtByWatch.delete(watchId) }
