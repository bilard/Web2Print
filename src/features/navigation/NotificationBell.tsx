import { useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck, Trash2, CircleCheck, CircleX, TriangleAlert, Info } from 'lucide-react'
import { useNotificationsStore, type NotificationLevel } from '@/stores/notifications.store'
import { useTranslation } from '@/lib/i18n'

const LEVEL_ICON: Record<NotificationLevel, { icon: typeof Info; cls: string }> = {
  success: { icon: CircleCheck, cls: 'text-emerald-400' },
  error: { icon: CircleX, cls: 'text-red-400' },
  warning: { icon: TriangleAlert, cls: 'text-amber-400' },
  info: { icon: Info, cls: 'text-sky-400' },
}

function timeAgo(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return `il y a ${s} s`
  const m = Math.round(s / 60)
  if (m < 60) return `il y a ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `il y a ${h} h`
  return `il y a ${Math.round(h / 24)} j`
}

/**
 * Cloche de notifications : badge non-lus + panneau listant l'historique
 * (lib/notify.ts).
 * - `variant="fab"` (défaut) : rond flottant en bas-gauche (dashboard + modules).
 * - `variant="inline"` : bouton compact intégré dans une barre (barre de l'éditeur).
 */
export function NotificationBell({ variant = 'fab' }: { variant?: 'fab' | 'inline' }) {
  const isInline = variant === 'inline'
  const items = useNotificationsStore((s) => s.items)
  const markAllRead = useNotificationsStore((s) => s.markAllRead)
  const clear = useNotificationsStore((s) => s.clear)
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const unread = items.filter((n) => !n.read).length

  // Clic extérieur / Échap ferment le panneau ; l'ouverture marque tout lu.
  useEffect(() => {
    if (!open) return
    markAllRead()
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, markAllRead])

  return (
    <div ref={panelRef} className={isInline ? 'relative' : 'fixed bottom-16 left-4 z-30'}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={t('notif.title')}
        aria-label={t('notif.open')}
        aria-expanded={open}
        className={
          isInline
            ? 'relative w-7 h-7 rounded text-white/40 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors'
            : 'relative w-10 h-10 rounded-full bg-surface border border-white/10 hover:border-indigo-500/50 text-white/60 hover:text-indigo-400 flex items-center justify-center shadow-lg transition-colors'
        }
      >
        <Bell className={isInline ? 'w-4 h-4' : 'w-5 h-5'} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-indigo-500 text-[#fff] text-[9px] font-semibold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute left-0 ${isInline ? 'bottom-full mb-2' : 'bottom-12'} w-80 max-h-96 bg-surface-2 border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-150 z-50`}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
            <span className="text-[12px] font-medium text-white/70">{t('notif.title')}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={markAllRead}
                title={t('notif.markAllRead')}
                className="p-1 rounded text-white/30 hover:text-white/60 hover:bg-white/[0.04]"
              >
                <CheckCheck className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={clear}
                title={t('notif.clear')}
                className="p-1 rounded text-white/30 hover:text-red-400 hover:bg-white/[0.04]"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-[12px] text-white/25 text-center py-8">{t('notif.empty')}</p>
            ) : (
              items.map((n) => {
                const { icon: Icon, cls } = LEVEL_ICON[n.level]
                return (
                  <div key={n.id} className="flex items-start gap-2.5 px-3 py-2.5 border-b border-white/[0.04]">
                    <Icon className={`w-4 h-4 shrink-0 mt-px ${cls}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] text-white/75 leading-snug">{n.title}</div>
                      {n.message && <div className="text-[11px] text-white/40 leading-snug mt-0.5">{n.message}</div>}
                      <div className="text-[10px] text-white/25 mt-0.5">{timeAgo(n.ts)}</div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
