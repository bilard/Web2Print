// src/features/telegram/inboxWorker.ts
// Logique pure du worker : claim → traitement métier → done/error. Le traitement (`process`)
// et les I/O sont injectés via `deps`, ce qui rend la logique testable sans émulateur.
// Le `process` porte le comportement courant (2b : générer un workflow ; 2c : exécuter).

export interface InboxDoc {
  updateId: number
  chatId: number
  text: string
  status: string
  /** message_id Telegram (présent depuis la capture webhook) — requis pour supprimer côté Telegram. */
  messageId?: number
}

export interface InboxWorkerDeps {
  /** Passe le doc de pending → processing dans une transaction. true si ce worker a gagné. */
  claim: (updateId: number) => Promise<boolean>
  /** Traitement métier du message (génération, réponse Telegram…). Rejette en cas d'échec. */
  process: (doc: InboxDoc) => Promise<void>
  markDone: (updateId: number) => Promise<void>
  markError: (updateId: number, message: string) => Promise<void>
}

export type InboxCommand =
  | { kind: 'flow'; prompt: string }
  | { kind: 'clear' }
  | { kind: 'ignore' }
  | { kind: 'simple' }

/**
 * Reconnaît les commandes envoyées au bot depuis Telegram.
 * `/start` → ignore (commande de service Telegram, ne doit pas rester dans la boîte).
 * `/flow <demande>` → workflow (le reste est le prompt).
 * `/clear` | `/purge` | `/vider` → vide la boîte (app + Telegram).
 * Tout autre message → simple.
 */
export function parseInboxCommand(text: string): InboxCommand {
  const t = text.trim()
  if (/^\/start\b/i.test(t)) return { kind: 'ignore' }
  const flow = /^\/flow\b\s*([\s\S]*)$/i.exec(t)
  if (flow) return { kind: 'flow', prompt: flow[1].trim() }
  if (/^\/(clear|purge|vider)\b/i.test(t)) return { kind: 'clear' }
  return { kind: 'simple' }
}

export async function processInboxMessage(deps: InboxWorkerDeps, doc: InboxDoc): Promise<void> {
  const won = await deps.claim(doc.updateId)
  if (!won) return // un autre onglet a déjà pris ce message
  try {
    await deps.process(doc)
    await deps.markDone(doc.updateId)
  } catch (err) {
    await deps.markError(doc.updateId, err instanceof Error ? err.message : String(err))
  }
}
