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
import {
  processInboxMessage,
  parseInboxCommand,
  type InboxDoc,
  type InboxWorkerDeps,
  type InboxLogEntry,
} from './inboxWorker'
import { generateAndSaveWorkflow, requiresManualFile } from './generateWorkflowFromInbox'
import { executeWorkflowAndCollect, type ExecutionResult } from './executeWorkflowAndCollect'
import { resolveRun, injectInput } from './runWorkflowFromInbox'
import { askLlm } from './askLlmFromInbox'

/** Limite Telegram d'un message texte (4096 car.) — on tronque proprement en deçà. */
const TELEGRAM_TEXT_LIMIT = 4096
function truncateForTelegram(text: string): string {
  if (text.length <= TELEGRAM_TEXT_LIMIT) return text
  return text.slice(0, TELEGRAM_TEXT_LIMIT - 1) + '…'
}
import { listWorkflows, saveWorkflow } from '@/features/workflows/persistence/workflowsApi'
// Peuple le registre de nodes (imports à effet de bord) : la page Telegram n'importe pas l'éditeur,
// donc sans ça l'exécution headless échoue avec « Unknown node type ».
import { initWorkflowsRegistry } from '@/features/workflows/registry/builtin'

// Identifie cet onglet pour le claim (diagnostic).
const WORKER_ID = Math.random().toString(36).slice(2)

// Plafond de logs persistés par message (protège la taille du doc Firestore, limite 1 Mo).
const MAX_INBOX_LOGS = 150

// Résumé court d'une exécution, pour la dernière ligne de log de traitement.
function summarizeExec(exec: ExecutionResult): string {
  const parts = [`${exec.nodeCount} node(s) OK`]
  if (exec.errorCount > 0) parts.push(`${exec.errorCount} erreur(s)`)
  if (exec.file) parts.push(`fichier ${exec.file.filename}`)
  return `Terminé : ${parts.join(', ')}.`
}

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

    // Garantit que les node specs + ports sont enregistrés avant toute génération/exécution
    // de workflow déclenchée depuis Telegram (sinon registre vide → « Unknown node type »).
    initWorkflowsRegistry()

    // Envoie une réponse ET la journalise comme message sortant (visible dans la boîte).
    const reply = (chatId: number, text: string) =>
      sendTelegramMessage(botToken, { chatId: String(chatId), text })
        .then(({ messageId }) => void addOutboxMessage(chatId, text, messageId))
        .catch(() => {})

    // Renvoie le résultat d'une exécution : le fichier produit (en pièce jointe), ou un message
    // de statut. Partagé par /flow et /run. Journalise l'envoi (closure sur botToken).
    const sendExecResult = async (chatId: number, name: string, exec: ExecutionResult) => {
      if (exec.file) {
        const caption = `✅ « ${name} » — exécuté (${exec.nodeCount} node(s))`
        const sent = await sendTelegramDocument(botToken, {
          chatId: String(chatId),
          file: new File([exec.file.blob], exec.file.filename, { type: exec.file.blob.type }),
          caption,
        })
        void addOutboxMessage(chatId, `📎 ${exec.file.filename}\n${caption}`, sent.messageId)
      } else if (exec.nodeCount === 0 && exec.errorCount > 0) {
        await reply(chatId, `⚠️ « ${name} » exécution échouée : ${maskToken(exec.firstError || 'erreur inconnue')}`)
      } else {
        const suffix = exec.errorCount > 0 ? ` (${exec.errorCount} erreur(s))` : ''
        const warn = exec.logs.find((l) => l.level === 'warn')
        if (warn) {
          await reply(chatId, `⚠️ « ${name} » exécuté — ${exec.nodeCount} node(s)${suffix}, mais : ${maskToken(warn.msg)}`)
        } else {
          await reply(chatId, `✅ « ${name} » exécuté — ${exec.nodeCount} node(s), aucun fichier produit${suffix}.`)
        }
      }
    }

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
        // Logs de traitement de CE message, accumulés en mémoire puis écrits en entier (le worker
        // est sérialisé par doc via le claim → pas de concurrence, pas besoin d'arrayUnion).
        const ref = doc(db, 'telegramInbox', String(msg.updateId))
        const logs: InboxLogEntry[] = []
        const persist = () => updateDoc(ref, { logs }).catch(ignoreNotFound)
        const step = (level: InboxLogEntry['level'], text: string) => {
          logs.push({ ts: Date.now(), level, msg: maskToken(text) })
          if (logs.length > MAX_INBOX_LOGS) logs.splice(0, logs.length - MAX_INBOX_LOGS)
          return persist()
        }
        const stepBatch = (entries: InboxLogEntry[]) => {
          for (const e of entries) logs.push({ ts: e.ts, level: e.level, msg: maskToken(e.msg) })
          if (logs.length > MAX_INBOX_LOGS) logs.splice(0, logs.length - MAX_INBOX_LOGS)
          return persist()
        }

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
        // /run <nom> <texte> : exécute un workflow DÉJÀ sauvegardé en injectant le texte dans ses
        // nodes « Saisie texte ». /run seul (ou nom introuvable) → liste les workflows disponibles.
        if (cmd.kind === 'run') {
          await step('info', '📥 Commande /run reçue.')
          const res = resolveRun(await listWorkflows(uid), cmd.rest)
          if (!res.ok) {
            const list = res.available.length
              ? res.available.map((n) => `• ${n}`).join('\n')
              : '(aucun workflow sauvegardé)'
            const head =
              res.reason === 'no-name'
                ? 'Workflows disponibles — relance avec /run <nom> <texte> :'
                : 'Workflow introuvable. Workflows disponibles :'
            await step('warn', res.reason === 'no-name' ? 'Aucun nom fourni — liste renvoyée.' : 'Workflow introuvable — liste renvoyée.')
            await reply(msg.chatId, `${head}\n${list}`)
            return
          }
          await step('info', `Workflow « ${res.workflow.name} » trouvé.`)
          if (requiresManualFile(res.workflow)) {
            await step('warn', 'Non exécutable : contient un node fichier (Upload/Import).')
            await reply(
              msg.chatId,
              `⚠️ « ${res.workflow.name} » contient un node nécessitant un fichier (Upload/Import) — non exécutable automatiquement depuis Telegram.`,
            )
            return
          }
          const { workflow, injected } = injectInput(res.workflow, res.input)
          if (res.input && injected === 0) {
            await step('warn', 'Aucun node d’entrée alimentable — texte non injecté.')
            await reply(
              msg.chatId,
              `⚠️ « ${workflow.name} » n'a aucun node d'entrée alimentable (Saisie texte / Scrape URL) — ton texte ne sera pas injecté. Exécution quand même…`,
            )
          } else if (injected > 0) {
            await step('info', `Entrée injectée dans ${injected} node(s) d'entrée.`)
            // Persiste l'entrée injectée dans le workflow sauvegardé → visible/réutilisable dans
            // l'éditeur. Best-effort : un échec d'écriture ne bloque pas l'exécution (le clone en
            // mémoire porte déjà la valeur).
            await saveWorkflow(uid, workflow).catch((err) =>
              console.warn('telegram /run: échec sauvegarde workflow', maskToken(String(err))),
            )
            await step('info', 'Workflow sauvegardé.')
          }
          try {
            await step('info', '⏳ Exécution en cours…')
            const exec = await executeWorkflowAndCollect(workflow)
            await stepBatch(exec.logs)
            await step(exec.errorCount > 0 ? 'warn' : 'info', summarizeExec(exec))
            await sendExecResult(msg.chatId, workflow.name, exec)
          } catch (err) {
            const reason = maskToken(err instanceof Error ? err.message : String(err))
            await step('error', `Exécution échouée : ${reason}`)
            await reply(msg.chatId, `⚠️ « ${workflow.name} » exécution échouée : ${reason}`)
            throw err
          }
          return
        }
        // Message simple (sans commande) → transmis au LLM ACTIVÉ, réponse renvoyée sur Telegram.
        if (cmd.kind === 'simple') {
          const question = msg.text?.trim() ?? ''
          if (!question) {
            await step('info', 'Message vide — rien à exécuter.')
            return
          }
          await step('info', '🤖 Appel du LLM…')
          try {
            const { answer, model } = await askLlm(question)
            await step('info', `Réponse du LLM (${model || 'modèle inconnu'}).`)
            const header = model ? `🤖 ${model}\n\n` : '🤖\n\n'
            await reply(msg.chatId, truncateForTelegram(header + answer))
          } catch (err) {
            const reason = maskToken(err instanceof Error ? err.message : String(err))
            await step('warn', `LLM indisponible : ${reason}`)
            await reply(msg.chatId, `⚠️ LLM indisponible : ${reason}`)
          }
          return
        }
        if (!cmd.prompt) {
          await step('info', '/flow sans demande — aide renvoyée.')
          await reply(
            msg.chatId,
            'Pour lancer un workflow, écris ta demande après /flow.\nEx : /flow scrape https://exemple.com et exporte un Excel.',
          )
          return
        }

        // 1) Génération + sauvegarde (2b).
        await step('info', '🤖 Génération du workflow par IA…')
        let info
        try {
          info = await generateAndSaveWorkflow(cmd.prompt, uid)
        } catch (err) {
          const reason = maskToken(err instanceof Error ? err.message : String(err))
          await step('error', `Génération échouée : ${reason}`)
          await reply(msg.chatId, `❌ Génération échouée : ${reason}`)
          throw err
        }
        await step('info', `Workflow « ${info.name} » généré (${info.nodeCount} node(s)).`)
        await updateDoc(doc(db, 'telegramInbox', String(msg.updateId)), {
          generatedWorkflowId: info.workflowId,
          generatedWorkflowName: info.name,
        })

        // Le workflow nécessite un fichier choisi à la main → non exécutable en auto.
        if (requiresManualFile(info.workflow)) {
          await step('warn', 'Généré mais non exécutable : contient un node fichier (Upload/Import).')
          await reply(
            msg.chatId,
            `⚠️ « ${info.name} » généré, mais il contient un node nécessitant un fichier (Upload/Import) — non exécutable automatiquement. Ouvre-le dans Workflows pour le compléter, ou reformule avec une URL à scraper / des données dans ton message.`,
          )
          return
        }

        // 2) Exécution (2c) + retour du fichier produit. Le workflow reste sauvegardé même si
        //    l'exécution échoue (pas de rollback).
        try {
          await step('info', '⏳ Exécution en cours…')
          const exec = await executeWorkflowAndCollect(info.workflow)
          await stepBatch(exec.logs)
          await step(exec.errorCount > 0 ? 'warn' : 'info', summarizeExec(exec))
          await sendExecResult(msg.chatId, info.name, exec)
        } catch (err) {
          const reason = maskToken(err instanceof Error ? err.message : String(err))
          await step('error', `Exécution échouée : ${reason}`)
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
