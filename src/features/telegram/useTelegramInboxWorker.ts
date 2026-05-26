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
import { sendTelegramMessage, sendTelegramDocument, deleteTelegramMessage } from '@/lib/telegramApi'
import { addOutboxMessage, clearAllInbox, deleteInboxMessage } from './useTelegramInbox'
import { processInboxMessage, parseInboxCommand, type InboxDoc, type InboxWorkerDeps } from './inboxWorker'
import { generateAndSaveWorkflow, requiresManualFile } from './generateWorkflowFromInbox'
import { executeWorkflowAndCollect } from './executeWorkflowAndCollect'

// Identifie cet onglet pour le claim (diagnostic).
const WORKER_ID = Math.random().toString(36).slice(2)

// Évite qu'un token Telegram apparaisse dans un message d'erreur persisté ou renvoyé.
function maskToken(msg: string): string {
  return msg.replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot***')
}

// Tolère un doc déjà supprimé (ex : /clear efface aussi son propre message en cours de traitement,
// ou l'utilisateur supprime un message via l'UI pendant son traitement).
function ignoreNotFound(err: unknown): void {
  if ((err as { code?: string }).code !== 'not-found') throw err
}

export function useTelegramInboxWorker(): void {
  const user = useAuthStore((s) => s.user)
  const botToken = useTelegramStore((s) => s.botToken)

  useEffect(() => {
    const uid = user?.uid
    if (!uid || !botToken) return

    // Envoie une réponse ET la journalise comme message sortant (visible dans la boîte).
    const reply = (chatId: number, text: string) =>
      sendTelegramMessage(botToken, { chatId: String(chatId), text })
        .then(({ messageId }) => void addOutboxMessage(chatId, text, messageId))
        .catch(() => {})

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
        // Mémorise le chat par défaut au 1er message reçu (persisté + sync) : permet d'envoyer
        // depuis l'app sans config manuelle.
        if (!useTelegramStore.getState().chatId.trim() && msg.chatId) {
          useTelegramStore.getState().setChatId(String(msg.chatId))
        }

        // Routage des commandes envoyées depuis Telegram.
        const cmd = parseInboxCommand(msg.text)
        // /start (commande de service Telegram envoyée par le client iPhone) : on le supprime
        // de Telegram (pour qu'il ne traîne pas sur le téléphone) ET de la boîte. Aucune réponse.
        if (cmd.kind === 'ignore') {
          if (msg.messageId != null) {
            await deleteTelegramMessage(botToken, { chatId: msg.chatId, messageId: msg.messageId }).catch(() => {})
          }
          await deleteInboxMessage(msg.updateId)
          return
        }
        // /clear : vide toute la boîte (Telegram < 48 h + Firestore), y compris ce message.
        if (cmd.kind === 'clear') {
          const n = await clearAllInbox(botToken)
          await reply(msg.chatId, `🧹 Boîte vidée (${n} message(s) supprimé(s)).`)
          return
        }
        // Message simple (sans commande) → aucune réponse auto, juste reçu et marqué « traité ».
        if (cmd.kind === 'simple') return
        if (!cmd.prompt) {
          await reply(
            msg.chatId,
            'Pour lancer un workflow, écris ta demande après /flow.\nEx : /flow scrape https://exemple.com et exporte un Excel.',
          )
          return
        }

        // 1) Génération + sauvegarde (2b).
        let info
        try {
          info = await generateAndSaveWorkflow(cmd.prompt, uid)
        } catch (err) {
          const reason = maskToken(err instanceof Error ? err.message : String(err))
          await reply(msg.chatId, `❌ Génération échouée : ${reason}`)
          throw err
        }
        await updateDoc(doc(db, 'telegramInbox', String(msg.updateId)), {
          generatedWorkflowId: info.workflowId,
          generatedWorkflowName: info.name,
        })

        // Le workflow nécessite un fichier choisi à la main → non exécutable en auto.
        if (requiresManualFile(info.workflow)) {
          await reply(
            msg.chatId,
            `⚠️ « ${info.name} » généré, mais il contient un node nécessitant un fichier (Upload/Import) — non exécutable automatiquement. Ouvre-le dans Workflows pour le compléter, ou reformule avec une URL à scraper / des données dans ton message.`,
          )
          return
        }

        // 2) Exécution (2c) + retour du fichier produit. Le workflow reste sauvegardé même si
        //    l'exécution échoue (pas de rollback).
        try {
          const exec = await executeWorkflowAndCollect(info.workflow)
          if (exec.file) {
            const caption = `✅ « ${info.name} » — exécuté (${exec.nodeCount} node(s))`
            const sent = await sendTelegramDocument(botToken, {
              chatId: String(msg.chatId),
              file: new File([exec.file.blob], exec.file.filename, { type: exec.file.blob.type }),
              caption,
            })
            // Journalise l'envoi du fichier comme message sortant (avec message_id → suppressible).
            void addOutboxMessage(msg.chatId, `📎 ${exec.file.filename}\n${caption}`, sent.messageId)
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
        }).catch(ignoreNotFound)
      },
      markError: async (updateId, message) => {
        await updateDoc(doc(db, 'telegramInbox', String(updateId)), {
          status: 'error',
          errorMessage: maskToken(message),
          processedAt: serverTimestamp(),
        }).catch(ignoreNotFound)
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
