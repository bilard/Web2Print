// functions/src/workflow/runHistory.ts
import { getFirestore } from 'firebase-admin/firestore'
import type { HeadlessResult } from './execute'

const MAX_LOGS = 200

export async function writeRunHistory(
  uid: string,
  meta: { workflowId: string; name: string; trigger: 'cron' | 'manual' | 'webhook'; startedAt: number },
  result: HeadlessResult,
): Promise<void> {
  const logs = result.logs.slice(-MAX_LOGS)
  await getFirestore().collection('users').doc(uid).collection('workflowRuns').add({
    workflowId: meta.workflowId, name: meta.name, trigger: meta.trigger,
    startedAt: meta.startedAt, endedAt: Date.now(),
    status: result.status, nodeCount: result.nodeCount, errorCount: result.errorCount, logs,
  })
}
