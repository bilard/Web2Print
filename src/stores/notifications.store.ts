// Centre de notifications global : historique persistant (localStorage) des
// évènements importants (runs de workflows, exports, erreurs), alimenté via
// lib/notify.ts qui double chaque entrée d'un toast Sonner.
import { create } from 'zustand'

export type NotificationLevel = 'success' | 'error' | 'warning' | 'info'

export interface AppNotification {
  id: string
  ts: number
  level: NotificationLevel
  title: string
  message?: string
  read: boolean
}

const STORAGE_KEY = 'notifications.v1'
const MAX_ITEMS = 50

function load(): AppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as AppNotification[]
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ITEMS) : []
  } catch {
    return []
  }
}

function persist(items: AppNotification[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)))
  } catch { /* stockage indisponible : historique non persisté */ }
}

interface NotificationsState {
  items: AppNotification[]
  add: (level: NotificationLevel, title: string, message?: string) => void
  markAllRead: () => void
  clear: () => void
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  items: load(),
  add: (level, title, message) =>
    set((s) => {
      const items = [
        {
          id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          ts: Date.now(),
          level,
          title,
          message,
          read: false,
        },
        ...s.items,
      ].slice(0, MAX_ITEMS)
      persist(items)
      return { items }
    }),
  markAllRead: () =>
    set((s) => {
      const items = s.items.map((n) => (n.read ? n : { ...n, read: true }))
      persist(items)
      return { items }
    }),
  clear: () => {
    persist([])
    return set({ items: [] })
  },
}))
