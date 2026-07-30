// Boîte de réception Telegram : liste temps réel des messages entrants + statut, envoi d'un
// message vers le chat (App → Telegram) et actions par message (éditer / supprimer via InboxItem).
import { useState } from 'react'
import { toast } from 'sonner'
import { Inbox, Loader2, Send, X, Trash2, Info } from 'lucide-react'
import { useTelegramInbox, useInboxAutoCleanup, deleteAllInboxEverywhere, addOutboxMessage, INBOX_RETENTION_DAYS } from './useTelegramInbox'
import { useTelegramStore } from '@/stores/telegram.store'
import { useTelegramInboxWorker } from './useTelegramInboxWorker'
import { sendTelegramMessage } from '@/lib/telegramApi'
import { InboxItem } from './InboxItem'
import { useModuleIntent } from '@/features/navigation/useModuleIntent'
import { useCan } from '@/features/access/useAccess'
import { t } from '@/lib/i18n'

export function TelegramInboxView() {
  // Le worker tourne tant que cette page est ouverte (onglet dédié) — store de run isolé.
  useTelegramInboxWorker()
  // Purge auto des messages anciens (local only) au montage.
  useInboxAutoCleanup()
  const { messages, loading } = useTelegramInbox()
  const defaultChatId = useTelegramStore((s) => s.chatId)
  const botToken = useTelegramStore((s) => s.botToken)
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  // Droit « telegram.send » (gestion des rôles) : sans lui, la boîte reste
  // consultable mais la composition/envoi vers Telegram est masquée.
  const canSend = useCan('telegram.send')

  useModuleIntent('telegram', (action) => {
    if (action === 'action:new' && canSend) setComposing(true)
  })

  // Chat cible : le Chat ID configuré, sinon l'expéditeur du dernier message reçu (tu as
  // forcément parlé au bot pour qu'il y ait des messages). Évite d'imposer une config manuelle.
  const lastValidChat = messages.find((m) => typeof m.chatId === 'number' && m.chatId > 0)?.chatId
  const effectiveChatId = defaultChatId.trim() || (lastValidChat != null ? String(lastValidChat) : '')

  // Envoie réellement un message vers le chat Telegram (App → Telegram).
  const onSend = async () => {
    if (!canSend) return
    const t = draft.trim()
    if (!t) return
    if (!botToken) {
      toast.error('Configure le bot token (Settings → Connecteurs → Telegram).')
      return
    }
    if (!effectiveChatId) {
      toast.error('Aucun Chat ID : écris d’abord au bot, ou renseigne le Chat ID par défaut dans Settings.')
      return
    }
    setSending(true)
    try {
      const { messageId } = await sendTelegramMessage(botToken, { chatId: effectiveChatId, text: t })
      // Journalise le message sortant (avec son message_id → suppressible côté Telegram ensuite).
      void addOutboxMessage(Number(effectiveChatId), t, messageId)
      toast.success('Message envoyé sur Telegram.')
      setDraft('')
      setComposing(false)
    } catch (err) {
      toast.error(`Échec de l'envoi : ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSending(false)
    }
  }

  const onClearAll = async () => {
    await deleteAllInboxEverywhere(messages, botToken)
    setConfirmClear(false)
  }

  return (
    <div className="h-full bg-background text-white flex flex-col overflow-hidden">
      <header className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2 shrink-0">
        <Inbox className="w-4 h-4 text-blue-400" />
        <h1 className="text-[13px] font-semibold text-white/80">{t('tg.inbox')}</h1>
        <span className="text-[11px] text-neutral-500">{messages.length} message(s)</span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded border ${
            botToken
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
              : 'bg-neutral-500/10 text-neutral-500 border-neutral-600/30'
          }`}
          title={
            botToken
              ? 'Cet onglet écoute et traite les messages Telegram.'
              : 'Configure le bot token dans Settings → Connecteurs → Telegram.'
          }
        >
          {botToken ? '● worker actif' : '○ token manquant'}
        </span>
        <span
          className="text-[10px] text-neutral-600"
          title={t('tg.retentionFull', { days: INBOX_RETENTION_DAYS })}
        >
          {t('tg.autoPurge', { days: INBOX_RETENTION_DAYS })}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {messages.length > 0 &&
            (confirmClear ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-neutral-400">
                  {t('tg.deleteN', { count: messages.length })}
                </span>
                <button
                  type="button"
                  onClick={onClearAll}
                  className="text-[11px] px-2 py-1 rounded-md bg-red-500/20 text-red-200 hover:bg-red-500/30 border border-red-500/30"
                >
                  {t('tg.confirm')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="text-[11px] px-2 py-1 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.06]"
                >
                  {t('tg.cancel')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/30"
              >
                <Trash2 className="w-3 h-3" /> {t('tg.deleteAll')}
              </button>
            ))}
          {canSend && (
            <button
              type="button"
              onClick={() => setComposing((c) => !c)}
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-blue-500/15 text-blue-200 hover:bg-blue-500/25 border border-blue-500/30"
            >
              <Send className="w-3 h-3" /> {t('tg.newMessage')}
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        {composing && canSend && (
          <div className="max-w-2xl mb-3 space-y-1.5 rounded-lg border border-blue-500/30 bg-blue-500/5 p-2.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              autoFocus
              placeholder={t('tg.sendPlaceholder', { chat: effectiveChatId || t('tg.noChatYet') })}
              className="w-full bg-background border border-neutral-700 rounded-md px-2 py-1 text-[13px] text-white placeholder:text-neutral-600 outline-none resize-y"
            />
            <div className="flex gap-1.5">
              <button
                onClick={onSend}
                disabled={!draft.trim() || sending}
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-blue-500/20 text-blue-100 hover:bg-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="w-3 h-3" /> {sending ? 'Envoi…' : 'Envoyer'}
              </button>
              <button
                onClick={() => {
                  setDraft('')
                  setComposing(false)
                }}
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded text-neutral-400 hover:text-white hover:bg-white/[0.06]"
              >
                <X className="w-3 h-3" /> Annuler
              </button>
            </div>
          </div>
        )}

        {!loading && messages.length > 0 && (
          <div className="max-w-2xl mb-3 flex items-start gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-neutral-500 leading-relaxed">
            <Info className="w-3 h-3 mt-0.5 shrink-0 text-neutral-600" />
            <span>
              Supprimer un message ici l’efface aussi sur Telegram (sous 48 h). En revanche, un
              message supprimé depuis Telegram reste affiché ici : l’API bot ne notifie pas les
              suppressions faites côté Telegram. La synchronisation n’est donc que dans le sens
              app → Telegram.
            </span>
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
