// src/stores/telegram.store.ts
// Bot token Telegram utilisé par le worker pour répondre. Persisté en localStorage.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface TelegramState {
  botToken: string
  setBotToken: (token: string) => void
}

export const useTelegramStore = create<TelegramState>()(
  persist(
    (set) => ({
      botToken: '',
      setBotToken: (token) => set({ botToken: token }),
    }),
    { name: 'designstudio_telegram' },
  ),
)
