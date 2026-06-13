// functions/src/telegram/responder.ts
// Répondeur Telegram SERVEUR : déclenché à l'arrivée d'un message dans
// telegramInbox, il répond depuis votre iPhone SANS navigateur ouvert pour :
//  - les messages simples → réponse LLM (clés du compte, Anthropic→Gemini) ;
//  - /run <nom> → exécution serveur du workflow (mêmes nodes que le cron).
// Les demandes nécessitant le navigateur (/flow, /clear, nodes de rendu) sont
// REMISES en pending pour le worker de l'app, avec un message d'attente.
// Coordination anti-double-traitement : claim transactionnel pending→processing,
// identique à celui du worker navigateur (un seul gagnant).
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { executeWorkflowHeadless } from '../workflow/execute'
import { writeRunHistory } from '../workflow/runHistory'
import { generateAndSaveWorkflowServer } from '../workflow/promptToFlowServer'
import type { ServerWorkflow } from '../workflow/types'
import '../workflow/nodes/index' // enregistre les nodes serveur (effet de bord)
import { askLlmServer } from './askLlmServer'
import {
  parseInboxCommand, resolveRun, injectInput, browserOnlyTypes,
  truncateForTelegram, maskToken,
} from './responderCore'

if (!getApps().length) initializeApp()

const RUN_TIMEOUT_MS = 240_000
const MAX_INBOX_LOGS = 150

interface InboxDocData {
  updateId?: number | string
  chatId?: number | string
  text?: string
  status?: string
  direction?: string
  messageId?: number
}

async function telegramSend(botToken: string, chatId: number | string, text: string): Promise<number | undefined> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: { message_id?: number } } | null
  return json?.ok ? json.result?.message_id : undefined
}

/** Journalise une réponse comme message sortant (visible dans la boîte de l'app). */
async function writeOutbox(chatId: number | string, text: string, messageId?: number): Promise<void> {
  const id = `out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await getFirestore().doc(`telegramInbox/${id}`).set({
    updateId: id,
    chatId,
    fromUsername: null,
    text,
    status: 'done',
    direction: 'out',
    receivedAt: FieldValue.serverTimestamp(),
    ...(messageId != null ? { messageId } : {}),
  }).catch(() => {})
}

export const telegramResponder = onDocumentCreated(
  { document: 'telegramInbox/{updateId}', region: 'europe-west1', timeoutSeconds: 300, memory: '512MiB', maxInstances: 3 },
  async (event) => {
    const snap = event.data
    if (!snap) return
    const d = snap.data() as InboxDocData
    // Filtre : messages sortants (écrits par l'app/le serveur) et docs non-pending.
    if (d.direction === 'out' || d.status !== 'pending' || typeof d.text !== 'string' || d.chatId == null) return

    const db = getFirestore()

    // chat_id → compte utilisateur (clés LLM, bot token, workflows).
    const users = await db.collection('users').where('telegram.chatId', '==', String(d.chatId)).limit(1).get()
    if (users.empty) {
      console.log('telegramResponder: aucun compte pour le chat', d.chatId, '— laissé au worker navigateur.')
      return
    }
    const uid = users.docs[0].id
    const tg = (users.docs[0].data().telegram ?? {}) as { botToken?: string }
    const botToken = tg.botToken
    if (!botToken) return // pas de token serveur → le navigateur répondra

    // Claim transactionnel : un seul worker (serveur OU onglet navigateur) gagne.
    const claimed = await db.runTransaction(async (tx) => {
      const cur = await tx.get(snap.ref)
      if (!cur.exists || cur.get('status') !== 'pending') return false
      tx.update(snap.ref, { status: 'processing', workerId: 'server', claimedAt: FieldValue.serverTimestamp() })
      return true
    })
    if (!claimed) return

    const logs: { ts: number; level: 'info' | 'warn' | 'error'; msg: string }[] = []
    const step = (level: 'info' | 'warn' | 'error', msg: string) => {
      logs.push({ ts: Date.now(), level, msg: maskToken(msg) })
      if (logs.length > MAX_INBOX_LOGS) logs.splice(0, logs.length - MAX_INBOX_LOGS)
    }
    const reply = async (text: string) => {
      const mid = await telegramSend(botToken, d.chatId!, truncateForTelegram(text))
      await writeOutbox(d.chatId!, text, mid)
    }
    const markDone = () =>
      snap.ref.update({ status: 'done', processedAt: FieldValue.serverTimestamp(), logs }).catch(() => {})
    const markError = (msg: string) =>
      snap.ref.update({ status: 'error', errorMessage: maskToken(msg), processedAt: FieldValue.serverTimestamp(), logs }).catch(() => {})
    /** Rend le message au worker navigateur (re-pending) avec un message d'attente optionnel. */
    const deferToBrowser = async (notice?: string) => {
      if (notice) await reply(notice)
      await snap.ref.update({ status: 'pending', workerId: FieldValue.delete(), serverDeferred: true, logs }).catch(() => {})
    }

    try {
      const cmd = parseInboxCommand(d.text)

      // /start : commande de service. On supprime la ligne « /start » de Telegram (pour ne pas
      // la laisser traîner) puis on envoie un message de bienvenue. Indispensable : tant que la
      // conversation est vide, Telegram affiche le bouton « Démarrer » au lieu du champ de saisie ;
      // une réponse garde l'historique non vide et débloque la saisie côté client.
      if (cmd.kind === 'ignore') {
        if (typeof d.messageId === 'number') {
          await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ chat_id: d.chatId, message_id: d.messageId }),
          }).catch(() => {})
        }
        await reply(
          'Bot prêt ✅\nEnvoie-moi un message, ou lance un workflow :\n• /flow <demande> — génère et exécute un workflow\n• /run <nom> — exécute un workflow sauvegardé\n• /clear — efface la conversation',
        )
        await markDone()
        return
      }

      // /clear : purge locale + Telegram — sémantique du navigateur, on lui rend la main.
      if (cmd.kind === 'clear') {
        step('info', '/clear laissé au worker navigateur (purge locale).')
        await deferToBrowser()
        return
      }

      // /flow <demande> : génération serveur (catalogue 100 % serveur) puis exécution.
      if (cmd.kind === 'flow') {
        if (!cmd.prompt) {
          await reply('Pour lancer un workflow, écris ta demande après /flow.\nEx : /flow scrape https://exemple.com et préviens-moi sur Telegram.')
          await markDone()
          return
        }
        step('info', '🤖 Génération du workflow par IA (serveur)…')
        let info
        try {
          info = await generateAndSaveWorkflowServer(uid, cmd.prompt)
        } catch (err) {
          const reason = maskToken(err instanceof Error ? err.message : String(err))
          step('error', `Génération échouée : ${reason}`)
          await reply(`❌ Génération échouée : ${reason}`)
          await markError(reason)
          return
        }
        step('info', `Workflow « ${info.name} » généré (${info.nodeCount} node(s)).`)
        await snap.ref.update({ generatedWorkflowId: info.workflow.id, generatedWorkflowName: info.name }).catch(() => {})

        step('info', '⏳ Exécution serveur en cours…')
        const startedAt = Date.now()
        const ac = new AbortController()
        const timer = setTimeout(() => ac.abort(), RUN_TIMEOUT_MS)
        try {
          const result = await executeWorkflowHeadless(info.workflow, { uid, signal: ac.signal })
          await writeRunHistory(uid, { workflowId: info.workflow.id, name: info.name, trigger: 'telegram', startedAt }, result)
          for (const l of result.logs.slice(-30)) step(l.level, l.msg)
          if (result.errorCount > 0) {
            const firstError = result.logs.find((l) => l.level === 'error')?.msg ?? 'erreur inconnue'
            await reply(`⚠️ « ${info.name} » généré, mais exécution : ${result.nodeCount} node(s) OK, ${result.errorCount} erreur(s) — ${maskToken(firstError)}. Le workflow est sauvegardé dans l’app.`)
          } else {
            await reply(`✅ « ${info.name} » généré et exécuté côté serveur — ${result.nodeCount} node(s). Retrouve-le dans Workflows.`)
          }
        } finally {
          clearTimeout(timer)
        }
        await markDone()
        return
      }

      // /run <nom> <texte> : exécution serveur si tous les nodes le permettent.
      if (cmd.kind === 'run') {
        step('info', '📥 /run reçu (serveur).')
        const wfSnap = await db.collection(`users/${uid}/workflows`).get()
        const workflows: ServerWorkflow[] = wfSnap.docs.map((doc) => {
          const w = doc.data() as { name?: string; nodes?: unknown; edges?: unknown }
          return {
            id: doc.id, name: w.name ?? doc.id, ownerId: uid,
            nodes: (w.nodes ?? []) as ServerWorkflow['nodes'],
            edges: (w.edges ?? []) as ServerWorkflow['edges'],
          }
        })
        const res = resolveRun(workflows, cmd.rest)
        if (!res.ok) {
          const list = res.available.length ? res.available.map((n) => `• ${n}`).join('\n') : '(aucun workflow sauvegardé)'
          const head = res.reason === 'no-name'
            ? 'Workflows disponibles — relance avec /run <nom> <texte> :'
            : 'Workflow introuvable. Workflows disponibles :'
          step('warn', res.reason === 'no-name' ? 'Aucun nom fourni — liste renvoyée.' : 'Introuvable — liste renvoyée.')
          await reply(`${head}\n${list}`)
          await markDone()
          return
        }
        const blocked = browserOnlyTypes(res.workflow)
        if (blocked.length > 0) {
          step('warn', `Nodes navigateur requis : ${blocked.join(', ')} — différé.`)
          await deferToBrowser(
            `⏳ « ${res.workflow.name} » contient des étapes nécessitant l’app ouverte (${blocked.join(', ')}) — il sera exécuté à ta prochaine ouverture de l’app.`,
          )
          return
        }
        const { workflow, injected } = injectInput(res.workflow, res.input)
        if (injected > 0) step('info', `Entrée injectée dans ${injected} node(s).`)
        step('info', '⏳ Exécution serveur en cours…')
        const startedAt = Date.now()
        const ac = new AbortController()
        const timer = setTimeout(() => ac.abort(), RUN_TIMEOUT_MS)
        try {
          const result = await executeWorkflowHeadless(workflow, { uid, signal: ac.signal })
          await writeRunHistory(uid, { workflowId: workflow.id, name: workflow.name, trigger: 'telegram', startedAt }, result)
          for (const l of result.logs.slice(-30)) step(l.level, l.msg)
          if (result.errorCount > 0) {
            const firstError = result.logs.find((l) => l.level === 'error')?.msg ?? 'erreur inconnue'
            await reply(`⚠️ « ${workflow.name} » — ${result.nodeCount} node(s) OK, ${result.errorCount} erreur(s) : ${maskToken(firstError)}`)
          } else {
            await reply(`✅ « ${workflow.name} » exécuté côté serveur — ${result.nodeCount} node(s). Détails dans l’app (historique des runs).`)
          }
        } finally {
          clearTimeout(timer)
        }
        await markDone()
        return
      }

      // Message simple → réponse LLM avec contexte web (plan → Jina → réponse).
      const question = d.text.trim()
      if (!question) {
        step('info', 'Message vide — rien à faire.')
        await markDone()
        return
      }
      step('info', '🤖 LLM serveur (avec recherche web si nécessaire)…')
      const { answer, model, sources } = await askLlmServer(uid, question)
      step('info', `Réponse du LLM (${model})${sources.length ? ` — ${sources.length} source(s) web` : ''}.`)
      const footer = sources.length > 0 ? `\n\n🔗 Sources :\n${sources.map((s) => `• ${s}`).join('\n')}` : ''
      await reply(`🤖 ${model}\n\n${answer}${footer}`)
      await markDone()
    } catch (err) {
      const reason = maskToken(err instanceof Error ? err.message : String(err))
      step('error', reason)
      await reply(`⚠️ Traitement serveur échoué : ${reason}`).catch(() => {})
      await markError(reason)
    }
  },
)
