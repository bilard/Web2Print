// src/features/telegram/inboxWorker.ts
// Logique pure du worker : claim → accusé → done/error. Les I/O (Firestore, Telegram) sont
// injectées via `deps`, ce qui rend la logique testable sans émulateur.

export interface InboxDoc {
  updateId: number
  chatId: number
  text: string
  status: string
}

export interface InboxWorkerDeps {
  /** Passe le doc de pending → processing dans une transaction. true si ce worker a gagné. */
  claim: (updateId: number) => Promise<boolean>
  sendAck: (chatId: number, text: string) => Promise<void>
  markDone: (updateId: number) => Promise<void>
  markError: (updateId: number, message: string) => Promise<void>
}

export function buildAckText(text: string): string {
  return `reçu : ${text}`
}

export async function processInboxMessage(deps: InboxWorkerDeps, doc: InboxDoc): Promise<void> {
  const won = await deps.claim(doc.updateId)
  if (!won) return // un autre onglet a déjà pris ce message
  try {
    await deps.sendAck(doc.chatId, buildAckText(doc.text))
    await deps.markDone(doc.updateId)
  } catch (err) {
    await deps.markError(doc.updateId, err instanceof Error ? err.message : String(err))
  }
}
