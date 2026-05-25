// functions/src/telegramWebhook.ts
import { onRequest } from 'firebase-functions/v2/https'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { evaluateUpdate, type TelegramUpdate } from './telegram/evaluateUpdate'

if (!getApps().length) initializeApp()
const db = getFirestore()

interface TelegramConfig {
  webhookSecret?: string
  allowedChatIds?: number[]
}

export const telegramWebhook = onRequest(
  { region: 'europe-west1', maxInstances: 10, timeoutSeconds: 20 },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed')
      return
    }

    // Config (secret + allowlist) lue via admin (contourne les règles Firestore).
    const cfgSnap = await db.doc('telegramConfig/main').get()
    const cfg = (cfgSnap.data() ?? {}) as TelegramConfig
    const secret = cfg.webhookSecret
    const allowed = cfg.allowedChatIds ?? []

    if (!secret || req.header('X-Telegram-Bot-Api-Secret-Token') !== secret) {
      res.status(401).send('Unauthorized')
      return
    }

    const result = evaluateUpdate(req.body as TelegramUpdate, allowed)
    if (result.action === 'ignore') {
      // 200 silencieux : Telegram ne doit pas réessayer ce update.
      res.status(200).send(`ignored:${result.reason}`)
      return
    }

    // create() = idempotent : une réémission du même update_id lève already-exists.
    const ref = db.collection('telegramInbox').doc(String(result.record.updateId))
    try {
      await ref.create({
        ...result.record,
        status: 'pending',
        receivedAt: FieldValue.serverTimestamp(),
      })
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code !== 'already-exists') {
        // Erreur Firestore transitoire/réelle : renvoyer 500 pour que Telegram retransmette.
        console.error('telegramWebhook: échec create Firestore', { updateId: result.record.updateId, code })
        res.status(500).send('Internal Error')
        return
      }
      // already-exists → réémission Telegram, idempotent, rien à faire.
    }
    res.status(200).send('ok')
  },
)
