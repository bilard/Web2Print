// src/features/telegram/TelegramSettings.tsx
import { useTelegramStore } from '@/stores/telegram.store'

export function TelegramSettings() {
  const botToken = useTelegramStore((s) => s.botToken)
  const setBotToken = useTelegramStore((s) => s.setBotToken)

  return (
    <div className="space-y-2">
      <label className="text-xs text-neutral-400 block">Bot token Telegram (worker)</label>
      <input
        type="password"
        autoComplete="off"
        value={botToken}
        onChange={(e) => setBotToken(e.target.value)}
        placeholder="123456789:ABCdef..."
        className="w-full bg-[#0f0f0f] border border-neutral-700 rounded-md px-2 py-1.5 text-[12px] text-white placeholder:text-neutral-600 focus:border-cyan-500 outline-none"
      />
      <p className="text-[10px] text-neutral-600 leading-snug">
        Utilisé par le worker pour répondre aux messages reçus. Stocké localement (ce navigateur).
      </p>
    </div>
  )
}
