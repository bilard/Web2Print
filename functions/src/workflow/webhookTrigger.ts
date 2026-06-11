// functions/src/workflow/webhookTrigger.ts
// Déclencheur HTTP générique des workflows : POST ?id=<workflowId> + header
// X-Webhook-Secret. La config (uid propriétaire, secret, enabled) vit dans
// workflowWebhooks/{workflowId}, créée depuis l'éditeur de workflow (panneau
// Webhook). Exécution = même chemin headless que le cron (runOne).
import { onRequest } from 'firebase-functions/v2/https'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { runOne } from './scheduler'

if (!getApps().length) initializeApp()

interface WebhookConfig {
  uid?: string
  secret?: string
  enabled?: boolean
}

export const workflowWebhook = onRequest(
  { region: 'europe-west1', timeoutSeconds: 300, memory: '512MiB', maxInstances: 5 },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed — POST attendu')
      return
    }
    const workflowId = String(req.query.id ?? '')
    if (!workflowId) {
      res.status(400).send('Paramètre ?id=<workflowId> requis')
      return
    }
    const ref = getFirestore().doc(`workflowWebhooks/${workflowId}`)
    const snap = await ref.get()
    const cfg = (snap.data() ?? {}) as WebhookConfig
    // 404 indifférencié (doc absent, désactivé) pour ne pas révéler l'existence du workflow.
    if (!snap.exists || !cfg.enabled || !cfg.uid || !cfg.secret) {
      res.status(404).send('Not Found')
      return
    }
    const provided = req.header('X-Webhook-Secret') ?? String(req.query.secret ?? '')
    if (provided !== cfg.secret) {
      res.status(401).send('Unauthorized')
      return
    }
    try {
      const result = await runOne(cfg.uid, workflowId, 'webhook')
      await ref.update({ lastTriggeredAt: FieldValue.serverTimestamp(), lastStatus: result.status })
      res.status(result.status === 'error' ? 500 : 200).json({
        status: result.status,
        nodeCount: result.nodeCount,
        errorCount: result.errorCount,
      })
    } catch (err) {
      console.error('workflowWebhook: échec run', { workflowId, err })
      await ref.update({ lastTriggeredAt: FieldValue.serverTimestamp(), lastStatus: 'error' }).catch(() => {})
      res.status(500).json({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  },
)
