// Snapshots AUTOMATIQUES de filet de sécurité, en complément des versions
// manuelles (useVersions) : à chaque sauvegarde réussie, au plus une fois par
// fenêtre de 10 min, l'état du document est copié dans un ring buffer de 10
// slots (`versions/auto-0` … `auto-9`). L'ID de slot est dérivé du temps →
// le plus ancien est naturellement écrasé, aucune purge à exécuter.
import { doc, setDoc } from 'firebase/firestore'
import { recordAudit } from '@/lib/auditLog'
import { db } from '@/lib/firebase/config'

export const AUTO_SNAPSHOT_THROTTLE_MS = 10 * 60_000
export const MAX_AUTO_SNAPSHOTS = 10

/** Slot du ring buffer pour un instant donné — stable sur toute la fenêtre de
 *  throttle, donc deux écritures dans la même fenêtre visent le même doc. */
export function autoSnapshotSlot(nowMs: number): number {
  return Math.floor(nowMs / AUTO_SNAPSHOT_THROTTLE_MS) % MAX_AUTO_SNAPSHOTS
}

/** Throttle : un snapshot auto au plus par fenêtre. `lastAt` = dernier snapshot
 *  de CE projet dans la session (undefined = jamais → snapshot immédiat). */
export function shouldAutoSnapshot(lastAt: number | undefined, nowMs: number): boolean {
  return lastAt === undefined || nowMs - lastAt >= AUTO_SNAPSHOT_THROTTLE_MS
}

const lastAutoByProject = new Map<string, number>()

/**
 * Écrit un snapshot auto si la fenêtre de throttle est écoulée. Fire-and-forget
 * depuis save() — ne doit jamais faire échouer la sauvegarde principale.
 * `snapshot` = champs de CONTENU du doc projet (mêmes clés que useVersions).
 */
export async function maybeAutoSnapshot(projectId: string, snapshot: Record<string, unknown>): Promise<void> {
  const now = Date.now()
  if (!shouldAutoSnapshot(lastAutoByProject.get(projectId), now)) return
  lastAutoByProject.set(projectId, now)
  try {
    await setDoc(doc(db, 'projects', projectId, 'versions', `auto-${autoSnapshotSlot(now)}`), {
      label: `Auto — ${new Date(now).toLocaleString('fr-FR')}`,
      createdAt: now,
      auto: true,
      snapshot,
    })
    void recordAudit({ action: 'library.version.snapshot', module: 'library', targetId: projectId })
  } catch (err) {
    // Best-effort : un échec de snapshot ne doit pas remonter jusqu'au save.
    lastAutoByProject.delete(projectId)
    console.warn('[autoSnapshot] échec du snapshot auto :', err)
  }
}
