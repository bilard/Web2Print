// src/features/telegram/TelegramInboxView.tsx
// Boîte de réception Telegram : liste temps réel des messages entrants + statut.
import { Inbox, Loader2 } from 'lucide-react'
import { useTelegramInbox, type InboxStatus } from './useTelegramInbox'

export function statusMeta(status: InboxStatus): { label: string; cls: string } {
  switch (status) {
    case 'done':
      return { label: 'traité', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' }
    case 'processing':
      return { label: 'en cours', cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' }
    case 'error':
      return { label: 'erreur', cls: 'bg-red-500/15 text-red-300 border-red-500/30' }
    case 'pending':
    default:
      return { label: 'en attente', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' }
  }
}

function formatTime(ms?: number): string {
  if (!ms) return ''
  return new Date(ms).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

export function TelegramInboxView() {
  const { messages, loading } = useTelegramInbox()

  return (
    <div className="h-full bg-[#0f0f0f] text-white flex flex-col overflow-hidden">
      <header className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2 shrink-0">
        <Inbox className="w-4 h-4 text-blue-400" />
        <h1 className="text-[13px] font-semibold text-white/80">Boîte de réception Telegram</h1>
        <span className="text-[11px] text-neutral-500">{messages.length} message(s)</span>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
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
            {messages.map((m) => {
              const meta = statusMeta(m.status)
              return (
                <li
                  key={m.updateId}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${meta.cls}`}>
                      {meta.label}
                    </span>
                    <span className="text-[11px] text-neutral-500">
                      {m.fromUsername ? `@${m.fromUsername}` : `chat ${m.chatId}`}
                    </span>
                    <span className="text-[10px] text-neutral-600 ml-auto">
                      {formatTime(m.receivedAt?.toMillis())}
                    </span>
                  </div>
                  <div className="text-[13px] text-white/90 whitespace-pre-wrap break-words">
                    {m.text}
                  </div>
                  {m.status === 'error' && m.errorMessage && (
                    <div className="text-[10px] text-red-400/80 mt-1">{m.errorMessage}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </div>
  )
}
