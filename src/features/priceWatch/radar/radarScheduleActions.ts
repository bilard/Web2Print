// Actions du planificateur depuis la PWA radarPrice (parité CronStatusPanel de l'app) :
// arrêter LE run en cours, suspendre DURABLEMENT le flux, ou lancer une passe serveur.
// ⚠ Toutes ces opérations sont clefées par l'id du WORKFLOW (pas le watchId).
import { doc, setDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/lib/firebase/config'
import { getWorkflow, saveWorkflow } from '@/features/workflows/persistence/workflowsApi'
import { t } from '@/lib/i18n'

// Timeout aligné sur la Function (540 s côté serveur, marge large côté client) : une
// moisson avec escalade dépasse le défaut httpsCallable de 70 s.
const runNowCallable = httpsCallable<{ workflowId: string }, { status: string; nodeCount: number; errorCount: number }>(
  functions, 'runWorkflowNow', { timeout: 1800_000 },
)

/** STOP : pose le drapeau d'abandon que l'executor serveur relit (arrêt sous ~3 s).
 *  ⚠ N'arrête QU'UN run — le cron relancera au tick suivant. */
export async function stopServerRun(uid: string, workflowId: string): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'workflowAbort', workflowId), { requested: true, ts: Date.now() })
}

/** SUSPENDRE : désactive le node Cron puis réenregistre le workflow — `saveWorkflow`
 *  resynchronise le planning et SUPPRIME le doc `workflowSchedules` (plus aucune
 *  relance). Le run en cours est abandonné au passage. Retourne false si aucun cron actif. */
export async function suspendWorkflow(uid: string, workflowId: string): Promise<boolean> {
  const wf = await getWorkflow(uid, workflowId)
  // Jamais d'écriture à partir d'un workflow non chargé : on écraserait le graphe.
  if (!wf) throw new Error(t('err.pw.noWorkflowSuspend'))
  const cronNode = wf.nodes.find((n) => n.type === 'cron' && (n.config as { enabled?: boolean })?.enabled)
  if (!cronNode) return false
  const nodes = wf.nodes.map((n) =>
    n.id === cronNode.id ? { ...n, config: { ...(n.config as object), enabled: false } } : n)
  await stopServerRun(uid, workflowId)
  await saveWorkflow(uid, { ...wf, nodes })
  return true
}

/** Lancer une passe serveur immédiate (même callable que le bouton « Lancer (serveur) »). */
export async function runWorkflowNow(workflowId: string): Promise<{ nodeCount: number; errorCount: number }> {
  const { data } = await runNowCallable({ workflowId })
  return { nodeCount: data.nodeCount, errorCount: data.errorCount }
}
