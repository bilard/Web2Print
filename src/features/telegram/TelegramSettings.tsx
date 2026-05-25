// src/features/telegram/TelegramSettings.tsx
import { useTelegramStore } from '@/stores/telegram.store'

const inputCls =
  'w-full bg-[#0f0f0f] border border-neutral-700 rounded-md px-2 py-1.5 text-[12px] text-white placeholder:text-neutral-600 focus:border-cyan-500 outline-none'

export function TelegramSettings() {
  const botToken = useTelegramStore((s) => s.botToken)
  const chatId = useTelegramStore((s) => s.chatId)
  const setBotToken = useTelegramStore((s) => s.setBotToken)
  const setChatId = useTelegramStore((s) => s.setChatId)

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
