// src/features/telegram/useTelegramInboxWorker.ts
// Écoute les messages Telegram entrants (status pending) et les traite via inboxWorker.
// Monté globalement : actif dès qu'un utilisateur est connecté (choix « n'importe quel onglet »).
import { useEffect } from 'react'
import {
  collection, query, where, onSnapshot, runTransaction, doc, updateDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { useTelegramStore } from '@/stores/telegram.store'
import { sendTelegramMessage } from '@/lib/telegramApi'
import { processInboxMessage, type InboxDoc, type InboxWorkerDeps } from './inboxWorker'
import { generateAndSaveWorkflow } from './generateWorkflowFromInbox'

// Identifie cet onglet pour le claim (diagnostic).
const WORKER_ID = Math.random().toString(36).slice(2)

// Évite qu'un token Telegram apparaisse dans un message d'erreur persisté.
function maskToken(msg: string): string {
  return msg.replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot***')
}

export function useTelegramInboxWorker(): void {
  const user = useAuthStore((s) => s.user)
  const botToken = useTelegramStore((s) => s.botToken)

  useEffect(() => {
    const uid = user?.uid
    if (!uid || !botToken) return
    const q = query(collection(db, 'telegramInbox'), where('status', '==', 'pending'))

    const unsub = onSnapshot(
      q,
      (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type !== 'added') return
          const data = change.doc.data() as InboxDoc

          const deps: InboxWorkerDeps = {
            claim: (updateId) => {
              const ref = doc(db, 'telegramInbox', String(updateId))
              return runTransaction(db, async (tx) => {
                const cur = await tx.get(ref)
                if (!cur.exists() || cur.data()?.status !== 'pending') return false
                tx.update(ref, {
                  status: 'processing',
                  workerId: WORKER_ID,
                  claimedAt: serverTimestamp(),
                })
                return true
              })
            },
            process: async (msg) => {
              // 2b : génère un workflow depuis le texte, puis répond le résultat sur Telegram.
              try {
                const info = await generateAndSaveWorkflow(msg.text, uid)
                await sendTelegramMessage(botToken, {
                  chatId: String(msg.chatId),
                  text: `✅ Workflow « ${info.name} » généré — ${info.nodeCount} node(s). Ouvre-le dans le module Workflows.`,
                })
                await updateDoc(doc(db, 'telegramInbox', String(msg.updateId)), {
                  generatedWorkflowId: info.workflowId,
                  generatedWorkflowName: info.name,
                })
              } catch (err) {
                const reason = maskToken(err instanceof Error ? err.message : String(err))
                await sendTelegramMessage(botToken, {
                  chatId: String(msg.chatId),
                  text: `❌ Génération échouée : ${reason}`,
                }).catch(() => {})
                throw err // → markError enregistre la cause
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

          void processInboxMessage(deps, data).catch((err) => {
            console.warn(
              'telegramInbox: erreur non gérée dans processInboxMessage',
              err instanceof Error ? err.message : String(err),
            )
          })
        })
      },
      (err) => console.warn('telegramInbox listener error:', err.message),
    )

    return unsub
  }, [user?.uid, botToken])
}
