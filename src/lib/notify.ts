// src/lib/notify.ts
// Notification unifiée : toast Sonner immédiat + entrée persistante dans le
// centre de notifications (cloche globale). À utiliser pour les évènements
// que l'utilisateur peut vouloir retrouver après coup (fin de run, export,
// erreur) — les toasts purement éphémères peuvent rester sur `toast` direct.
import { toast } from 'sonner'
import { useNotificationsStore, type NotificationLevel } from '@/stores/notifications.store'

function record(level: NotificationLevel, title: string, message?: string): void {
  useNotificationsStore.getState().add(level, title, message)
}

export const notify = {
  success(title: string, message?: string): void {
    toast.success(message ? `${title} — ${message}` : title)
    record('success', title, message)
  },
  error(title: string, message?: string): void {
    toast.error(message ? `${title} — ${message}` : title)
    record('error', title, message)
  },
  warning(title: string, message?: string): void {
    toast.warning(message ? `${title} — ${message}` : title)
    record('warning', title, message)
  },
  info(title: string, message?: string): void {
    toast.info(message ? `${title} — ${message}` : title)
    record('info', title, message)
  },
}
