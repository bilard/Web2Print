// src/features/telegram/InboxItem.tsx
// Un message de la boîte de réception, avec menu d'actions (éditer / supprimer).
import { useState } from 'react'
import { MoreVertical, Pencil, Trash2, Check, X } from 'lucide-react'
import {
  statusMeta,
  deleteInboxMessage,
  updateInboxText,
  type InboxMessage,
} from './useTelegramInbox'

function formatTime(ms?: number): string {
  if (!ms) return ''
  return new Date(ms).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

export function InboxItem({ message }: { message: InboxMessage }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.text)
  const meta = statusMeta(message.status)

  const onSave = async () => {
    const t = draft.trim()
    if (t && t !== message.text) await updateInboxText(message.updateId, t)
    setEditing(false)
  }

  return (
    <li className="relative rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${meta.cls}`}>{meta.label}</span>
        <span className="text-[11px] text-neutral-500">
          {message.fromUsername ? `@${message.fromUsername}` : `chat ${message.chatId}`}
        </span>
        <span className="text-[10px] text-neutral-600 ml-auto">
          {formatTime(message.receivedAt?.toMillis())}
        </span>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="p-1 -mr-1 rounded text-neutral-500 hover:text-white hover:bg-white/[0.06]"
          aria-label="Actions du message"
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </button>
      </div>

      {editing ? (
        <div className="space-y-1.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            className="w-full bg-[#0f0f0f] border border-cyan-500/40 rounded-md px-2 py-1 text-[13px] text-white outline-none resize-y"
          />
          <div className="flex gap-1.5">
            <button
              onClick={onSave}
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25"
            >
              <Check className="w-3 h-3" /> Enregistrer
            </button>
            <button
              onClick={() => {
                setDraft(message.text)
                setEditing(false)
              }}
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded text-neutral-400 hover:text-white hover:bg-white/[0.06]"
            >
              <X className="w-3 h-3" /> Annuler
            </button>
          </div>
        </div>
      ) : (
        <div className="text-[13px] text-white/90 whitespace-pre-wrap break-words">
          {message.text}
        </div>
      )}
      {message.status === 'error' && message.errorMessage && !editing && (
        <div className="text-[10px] text-red-400/80 mt-1">{message.errorMessage}</div>
      )}
      {message.generatedWorkflowName && !editing && (
        <div className="text-[11px] text-indigo-300/90 mt-1 flex items-center gap-1">
          <span className="text-neutral-600">→ workflow :</span> {message.generatedWorkflowName}
        </div>
      )}

      {menuOpen && (
        <>
          {/* overlay invisible : ferme le menu au clic extérieur */}
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-2 top-9 z-20 w-32 rounded-md border border-white/10 bg-[#1a1a1a] shadow-xl py-1">
            <button
              onClick={() => {
                setEditing(true)
                setMenuOpen(false)
              }}
              className="flex items-center gap-2 w-full px-2.5 py-1.5 text-[12px] text-neutral-200 hover:bg-white/[0.06]"
            >
              <Pencil className="w-3 h-3" /> Éditer
            </button>
            <button
              onClick={() => {
                setMenuOpen(false)
                void deleteInboxMessage(message.updateId)
              }}
              className="flex items-center gap-2 w-full px-2.5 py-1.5 text-[12px] text-red-300 hover:bg-red-500/10"
            >
              <Trash2 className="w-3 h-3" /> Supprimer
            </button>
          </div>
        </>
      )}
    </li>
  )
}
