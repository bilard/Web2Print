// src/features/telegram/useTelegramInboxWorker.ts
// Worker Telegram : écoute les messages pending, génère un workflow (2b) puis l'exécute (2c) et
// renvoie le fichier produit. Monté UNIQUEMENT sur la page Telegram (onglet dédié) pour isoler
// le store de run de l'éditeur. Les messages sont traités EN SÉRIE (un executeWorkflow à la
// fois) : le store de run useRunContext est un singleton par onglet.
import { useEffect } from 'react'
import {
  collection, query, where, onSnapshot, runTransaction, doc, updateDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { useTelegramStore } from '@/stores/telegram.store'
import { sendTelegramMessage, sendTelegramDocument } from '@/lib/telegramApi'
import { processInboxMessage, type InboxDoc, type InboxWorkerDeps } from './inboxWorker'
import { generateAndSaveWorkflow } from './generateWorkflowFromInbox'
import { executeWorkflowAndCollect } from './executeWorkflowAndCollect'

// Identifie cet onglet pour le claim (diagnostic).
const WORKER_ID = Math.random().toString(36).slice(2)

// Évite qu'un token Telegram apparaisse dans un message d'erreur persisté ou renvoyé.
function maskToken(msg: string): string {
  return msg.replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot***')
}

export function useTelegramInboxWorker(): void {
  const user = useAuthStore((s) => s.user)
  const botToken = useTelegramStore((s) => s.botToken)

  useEffect(() => {
    const uid = user?.uid
    if (!uid || !botToken) return

    const reply = (chatId: number, text: string) =>
      sendTelegramMessage(botToken, { chatId: String(chatId), text }).catch(() => {})

    const deps: InboxWorkerDeps = {
      claim: (updateId) => {
        const ref = doc(db, 'telegramInbox', String(updateId))
        return runTransaction(db, async (tx) => {
          const cur = await tx.get(ref)
          if (!cur.exists() || cur.data()?.status !== 'pending') return false
          tx.update(ref, { status: 'processing', workerId: WORKER_ID, claimedAt: serverTimestamp() })
          return true
        })
      },
      process: async (msg) => {
        // 1) Génération + sauvegarde (2b).
        let info
        try {
          info = await generateAndSaveWorkflow(msg.text, uid)
        } catch (err) {
          const reason = maskToken(err instanceof Error ? err.message : String(err))
          await reply(msg.chatId, `❌ Génération échouée : ${reason}`)
          throw err
        }
        await updateDoc(doc(db, 'telegramInbox', String(msg.updateId)), {
          generatedWorkflowId: info.workflowId,
          generatedWorkflowName: info.name,
        })

        // 2) Exécution (2c) + retour du fichier produit. Le workflow reste sauvegardé même si
        //    l'exécution échoue (pas de rollback).
        try {
          const exec = await executeWorkflowAndCollect(info.workflow)
          if (exec.file) {
            await sendTelegramDocument(botToken, {
              chatId: String(msg.chatId),
              file: new File([exec.file.blob], exec.file.filename, { type: exec.file.blob.type }),
              caption: `✅ « ${info.name} » — exécuté (${exec.nodeCount} node(s))`,
            })
          } else if (exec.nodeCount === 0 && exec.errorCount > 0) {
            await reply(
              msg.chatId,
              `⚠️ « ${info.name} » généré mais exécution échouée : ${maskToken(exec.firstError || 'erreur inconnue')}`,
            )
          } else {
            const suffix = exec.errorCount > 0 ? ` (${exec.errorCount} erreur(s))` : ''
            await reply(
              msg.chatId,
              `✅ « ${info.name} » généré et exécuté — ${exec.nodeCount} node(s), aucun fichier produit${suffix}.`,
            )
          }
        } catch (err) {
          const reason = maskToken(err instanceof Error ? err.message : String(err))
          await reply(msg.chatId, `⚠️ « ${info.name} » généré mais exécution échouée : ${reason}`)
          throw err
        }
      },
      markDone: async (updateId) => {
        await updateDoc(doc(db, 'telegramInbox', String(updateId)), {
          status: 'done',
          processedAt: serverTimestamp(),
        })
      },
      markError: async (updateId, message) => {
        await updateDoc(doc(db, 'telegramInbox', String(updateId)), {
          status: 'error',
          errorMessage: maskToken(message),
          processedAt: serverTimestamp(),
        })
      },
    }

    // File de traitement SÉRIELLE : chaque message s'enchaîne après le précédent, garantissant
    // un seul executeWorkflow à la fois sur le store de run singleton.
    let queue: Promise<void> = Promise.resolve()
    const q = query(collection(db, 'telegramInbox'), where('status', '==', 'pending'))

    const unsub = onSnapshot(
      q,
      (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type !== 'added') return
          const data = change.doc.data() as InboxDoc
          queue = queue
            .then(() => processInboxMessage(deps, data))
            .catch((err) =>
              console.warn(
                'telegramInbox: erreur non gérée',
                err instanceof Error ? err.message : String(err),
              ),
            )
        })
      },
      (err) => console.warn('telegramInbox listener error:', err.message),
    )

    return unsub
  }, [user?.uid, botToken])
}
