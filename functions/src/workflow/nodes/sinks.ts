// functions/src/workflow/nodes/sinks.ts
// Réimplémentation SERVEUR (headless) des nodes PUITS client (save-pim, send-telegram).
// WIRE-COMPATIBLE avec les nodes client : mêmes clés de config, mêmes ports d'E/S,
// même FORME de document produit (pour rester lisible dans l'UI PIM) et même port de
// sortie `result`.
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { registerServerNode } from '../registry'
import { interpolate, extractRows } from '../interpolate'

// --- save-pim ---------------------------------------------------------------
// Config client (persistenceNodes.ts:9-12) : { projectId, sourceId }.
// Port d'entrée : `sheet` ({ rows }).  Sortie : { result: { count, projectId } }.
// Chemin Firestore (usePimFirebase.ts:32-44) : pim_projects/{projectId}/products/{_id},
// doc ID = product._id, écrit en { merge: true }.
// La FORME du document DOIT être le Product complet : `fields` est une map
// { [col]: { value, winningSourceId } } (pas des valeurs brutes), + sourceLinks/snapshot,
// sinon les produits ne sont pas lisibles dans l'UI PIM (Product.fields: Record<string, ProductField>).

const PIM_COLLECTION = 'pim_projects'
const PIM_PRODUCTS_SUB = 'products'

/** Retire récursivement les valeurs `undefined` (Firestore les rejette). Préserve null/arrays/objets. */
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefined(v)) as unknown as T
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue
      out[k] = stripUndefined(v)
    }
    return out as T
  }
  return value
}

function buildProduct(
  row: Record<string, unknown>,
  sourceId: string,
  now: number,
  fallbackId: string,
): Record<string, unknown> {
  const rowId = typeof row._id === 'string' && row._id ? row._id : fallbackId
  const fields: Record<string, { value: unknown; winningSourceId: string }> = {}
  const snapshot: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (k === '_id') continue
    fields[k] = { value: v, winningSourceId: sourceId }
    snapshot[k] = v
  }
  return {
    _id: rowId,
    masterSku: null,
    masterEan: null,
    primarySourceId: sourceId,
    fields,
    sourceLinks: [{ sourceId, snapshot }],
    taxonomyPath: [],
    needsDedup: false,
    createdAt: now,
    updatedAt: now,
  }
}

registerServerNode({
  type: 'save-pim',
  run: async (ctx, config, inputs) => {
    const projectId = String(config.projectId ?? '').trim()
    if (!projectId) throw new Error('save-pim : projectId manquant.')
    const sourceId = String(config.sourceId ?? '').trim() || 'workflow-import'

    const db: Firestore = getFirestore()

    // ⚠️ L'Admin SDK contourne les règles Firestore : on RÉ-IMPOSE ici la garde de
    // propriété que `firestore.rules` applique côté client (pim_projects/{id}.userId
    // == uid), sinon un workflow pourrait écrire dans le PIM d'un autre utilisateur.
    const projectSnap = await db.collection(PIM_COLLECTION).doc(projectId).get()
    if (!projectSnap.exists || projectSnap.data()?.userId !== ctx.uid) {
      throw new Error('save-pim : projet PIM introuvable ou non autorisé.')
    }

    const sheet = (inputs.sheet ?? { rows: [] }) as { rows?: Record<string, unknown>[] }
    const rows = Array.isArray(sheet.rows) ? sheet.rows : []
    const now = Date.now()

    const productsCol = db.collection(PIM_COLLECTION).doc(projectId).collection(PIM_PRODUCTS_SUB)

    let batch = db.batch()
    let pending = 0
    let count = 0
    for (let i = 0; i < rows.length; i++) {
      const product = buildProduct(rows[i], sourceId, now, `wf_${now}_${i}`)
      // doc ID = product._id, comme le client (saveProducts), avec merge.
      const ref = productsCol.doc(String(product._id))
      batch.set(ref, stripUndefined(product), { merge: true })
      pending++
      count++
      if (pending === 400) {
        await batch.commit()
        batch = db.batch()
        pending = 0
      }
    }
    if (pending > 0) await batch.commit()

    ctx.log('info', `save-pim : ${count} produit(s) écrit(s) dans ${projectId} (source ${sourceId}).`)
    return { result: { count, projectId } }
  },
})

// --- send-telegram ----------------------------------------------------------
// Config client (telegramNodes.tsx:40-46, 188-194) : { botToken, chatId, text, parseMode, iterate }.
// ⚠️ le champ message s'appelle `text` (PAS `message`).
// Port d'entrée texte : `data` (fallback quand `text` est vide).  Sortie : { result: { sent, count, messageIds } }.
// Bot token / chat id par défaut côté serveur : users/{uid}.telegram.{botToken,chatId}
// (useTelegramSettingsSync.ts:59,88 ; telegram.store.ts).
type TelegramParseMode = 'none' | 'HTML' | 'MarkdownV2'

interface TelegramRemote {
  botToken?: string
  chatId?: string
}

async function readTelegramConfig(uid: string): Promise<TelegramRemote> {
  const snap = await getFirestore().doc(`users/${uid}`).get()
  return (snap.data()?.telegram ?? {}) as TelegramRemote
}

/** Coerce le texte reçu sur le port `data` en message (scalaires uniquement, comme le client). */
function coerceDataText(data: unknown): string {
  if (typeof data === 'string') return data
  if (typeof data === 'number' || typeof data === 'boolean') return String(data)
  return ''
}

registerServerNode({
  type: 'send-telegram',
  run: async (ctx, config, inputs) => {
    const remote = await readTelegramConfig(ctx.uid)
    const effToken = (c: unknown) => String(c ?? '').trim() || String(remote.botToken ?? '').trim()
    const effChat = (c: unknown) => String(c ?? '').trim() || String(remote.chatId ?? '').trim()

    // Mode « 1 message par ligne » : ré-interpolation du config brut par ligne
    // (wire-compatible client). AUCUNE ligne reçue (ex : veille prix sans
    // variation) → rien n'est envoyé, par design.
    if (config.iterate) {
      const rows = extractRows(inputs.data)
      if (!rows || rows.length === 0) {
        ctx.log('info', 'Mode « 1 message par ligne » : aucune ligne reçue — rien à envoyer.')
        return { result: { sent: false, count: 0, messageIds: [] } }
      }
      const raw = (ctx.rawConfig ?? {}) as Record<string, unknown>
      const messageIds: number[] = []
      for (let i = 0; i < rows.length; i++) {
        if (ctx.signal.aborted) break
        const row = rows[i]
        const r = interpolate(raw, { ...row, row, index: i }) as Record<string, unknown>
        const token = effToken(r.botToken)
        const chatId = effChat(r.chatId)
        const text = String(r.text ?? '').trim()
        if (!token || !chatId || !text) {
          ctx.log('warn', `Ligne ${i + 1} ignorée : token, chat ou message manquant.`)
          continue
        }
        const id = await sendTelegramMessage(token, chatId, text, r.parseMode as TelegramParseMode | undefined)
        messageIds.push(id)
        ctx.log('info', `[${i + 1}/${rows.length}] → ${chatId} (msg ${id}).`)
      }
      return { result: { sent: messageIds.length > 0, count: messageIds.length, messageIds } }
    }

    const token = effToken(config.botToken)
    if (!token) {
      throw new Error('send-telegram : bot token introuvable (config ou users/{uid}.telegram.botToken).')
    }
    const chatId = effChat(config.chatId)
    if (!chatId) {
      throw new Error('send-telegram : chatId introuvable (config ou users/{uid}.telegram.chatId).')
    }

    const text = String(config.text ?? '').trim() ? String(config.text) : coerceDataText(inputs.data)
    if (!text.trim()) {
      throw new Error('send-telegram : message vide (champ Message ou port data).')
    }

    const messageId = await sendTelegramMessage(token, chatId, text, config.parseMode as TelegramParseMode | undefined)
    ctx.log('info', `Telegram envoyé à ${chatId} (msg ${messageId}).`)
    return { result: { sent: true, count: 1, messageIds: [messageId] } }
  },
})

/** Envoi d'un message texte ; lève une Error lisible sur refus Telegram. */
async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string,
  parseMode?: TelegramParseMode,
): Promise<number> {
  const body: Record<string, unknown> = { chat_id: chatId, text }
  if (parseMode && parseMode !== 'none') body.parse_mode = parseMode
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => null)) as
    | { ok: true; result: { message_id: number } }
    | { ok: false; error_code: number; description: string }
    | null
  if (!res.ok || !json || !json.ok) {
    const detail = json && !json.ok ? `${json.error_code} : ${json.description}` : `HTTP ${res.status}`
    throw new Error(`send-telegram : Telegram ${detail}`)
  }
  return json.result.message_id
}
