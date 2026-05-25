// src/features/telegram/TelegramSettings.tsx
import { useState, useEffect } from 'react'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { useTelegramStore } from '@/stores/telegram.store'
import { getTelegramBotInfo } from '@/lib/telegramApi'

const inputCls =
  'w-full bg-[#0f0f0f] border border-neutral-700 rounded-md px-2 py-1.5 text-[12px] text-white placeholder:text-neutral-600 focus:border-cyan-500 outline-none'

type ConnStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok'; label: string }
  | { kind: 'error'; label: string }

export function TelegramSettings() {
  const botToken = useTelegramStore((s) => s.botToken)
  const chatId = useTelegramStore((s) => s.chatId)
  const setBotToken = useTelegramStore((s) => s.setBotToken)
  const setChatId = useTelegramStore((s) => s.setChatId)
  const [status, setStatus] = useState<ConnStatus>({ kind: 'idle' })

  // Valide le bot token auprès de Telegram (getMe), avec un léger debounce sur la saisie.
  useEffect(() => {
    const token = botToken.trim()
    if (!token) {
      setStatus({ kind: 'idle' })
      return
    }
    setStatus({ kind: 'checking' })
    let cancelled = false
    const timer = setTimeout(() => {
      getTelegramBotInfo(token)
        .then((info) => {
          if (cancelled) return
          setStatus({ kind: 'ok', label: info.username ? `@${info.username}` : info.firstName })
        })
        .catch((err) => {
          if (cancelled) return
          setStatus({ kind: 'error', label: err instanceof Error ? err.message : 'token invalide' })
        })
    }, 600)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [botToken])

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-neutral-400 mb-1 block">Bot token Telegram</label>
        <input
          type="password"
          autoComplete="off"
          value={botToken}
          onChange={(e) => setBotToken(e.target.value)}
          placeholder="123456789:ABCdef..."
          className={inputCls}
        />
        {status.kind === 'checking' && (
          <span className="flex items-center gap-1 text-[10px] text-neutral-500 mt-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Vérification de la connexion…
          </span>
        )}
        {status.kind === 'ok' && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400 mt-1">
            <CheckCircle2 className="w-3 h-3" /> Connecté à {status.label}
          </span>
        )}
        {status.kind === 'error' && (
          <span className="flex items-center gap-1 text-[10px] text-red-400 mt-1">
            <AlertCircle className="w-3 h-3" /> {status.label}
          </span>
        )}
      </div>

      <div>
        <label className="text-xs text-neutral-400 mb-1 block">Chat ID par défaut</label>
        <input
          type="text"
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          placeholder="123456789 (ou @nomducanal)"
          className={inputCls}
        />
      </div>

      <p className="text-[10px] text-neutral-600 leading-snug">
        Config Telegram globale : sert au <strong className="text-neutral-400">worker</strong> qui
        répond aux messages reçus, et de <strong className="text-neutral-400">valeur par défaut</strong>{' '}
        au node « Envoyer via Telegram » (laisse ses champs vides pour utiliser ces valeurs).
        Synchronisée avec ton compte (Firestore) et ce navigateur.
      </p>
    </div>
  )
}
