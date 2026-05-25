// src/features/telegram/TelegramInboxView.tsx
// Boîte de réception Telegram : liste temps réel des messages entrants + statut,
// avec ajout manuel et actions par message (éditer / supprimer via InboxItem).
import { useState } from 'react'
import { Inbox, Loader2, Plus, Check, X } from 'lucide-react'
import { useTelegramInbox, addInboxMessage } from './useTelegramInbox'
import { useTelegramStore } from '@/stores/telegram.store'
import { InboxItem } from './InboxItem'

export function TelegramInboxView() {
  const { messages, loading } = useTelegramInbox()
  const defaultChatId = useTelegramStore((s) => s.chatId)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const onAdd = async () => {
    const t = draft.trim()
    if (!t) return
    await addInboxMessage(Number(defaultChatId) || 0, t)
    setDraft('')
    setAdding(false)
  }

  return (
    <div className="h-full bg-[#0f0f0f] text-white flex flex-col overflow-hidden">
      <header className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2 shrink-0">
        <Inbox className="w-4 h-4 text-blue-400" />
        <h1 className="text-[13px] font-semibold text-white/80">Boîte de réception Telegram</h1>
        <span className="text-[11px] text-neutral-500">{messages.length} message(s)</span>
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          className="ml-auto flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-blue-500/15 text-blue-200 hover:bg-blue-500/25 border border-blue-500/30"
        >
          <Plus className="w-3 h-3" /> Ajouter
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        {adding && (
          <div className="max-w-2xl mb-3 space-y-1.5 rounded-lg border border-blue-500/30 bg-blue-500/5 p-2.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              autoFocus
              placeholder="Texte du message à ajouter…"
              className="w-full bg-[#0f0f0f] border border-neutral-700 rounded-md px-2 py-1 text-[13px] text-white placeholder:text-neutral-600 outline-none resize-y"
            />
            <div className="flex gap-1.5">
              <button
                onClick={onAdd}
                disabled={!draft.trim()}
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-blue-500/20 text-blue-100 hover:bg-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check className="w-3 h-3" /> Ajouter
              </button>
              <button
                onClick={() => {
                  setDraft('')
                  setAdding(false)
                }}
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded text-neutral-400 hover:text-white hover:bg-white/[0.06]"
              >
                <X className="w-3 h-3" /> Annuler
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-neutral-600 text-[12px] py-16 max-w-md mx-auto leading-relaxed">
            Aucun message reçu. Écris à ton bot Telegram — les messages apparaîtront ici en
            temps réel.
          </div>
        ) : (
          <ul className="space-y-2 max-w-2xl">
            {messages.map((m) => (
              <InboxItem key={m.updateId} message={m} />
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
