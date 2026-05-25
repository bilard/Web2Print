// src/stores/telegram.store.ts
// Config Telegram globale (bot token + chat id par défaut). Partagée par le worker de
// réception ET utilisée par défaut par le node d'envoi quand ses champs sont vides.
// Persistée en localStorage et synchronisée avec Firestore users/{uid}.telegram
// (cf. src/features/settings/useTelegramSettingsSync.ts).
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface TelegramState {
  botToken: string
  chatId: string
  setBotToken: (token: string) => void
  setChatId: (chatId: string) => void
}

export const useTelegramStore = create<TelegramState>()(
  persist(
    (set) => ({
      botToken: '',
      chatId: '',
      setBotToken: (token) => set({ botToken: token }),
      setChatId: (chatId) => set({ chatId }),
    }),
    { name: 'designstudio_telegram' },
  ),
)
