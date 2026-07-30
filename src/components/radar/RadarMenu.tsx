import { useEffect } from 'react'
import { Menu, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { t, type TranslationKey } from '@/lib/i18n'

export interface RadarMenuItem<T extends string> {
  value: T
  labelKey: TranslationKey
  icon: LucideIcon
  /** Complément affiché à droite (ex. état du scraping, nombre de sites). */
  hint?: string
}

/** Bouton hamburger : porte AUSSI le nom de la vue courante (les onglets ayant disparu,
 *  c'est le seul repère de « où suis-je »). */
export function RadarMenuButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={t('rd.openMenu')} aria-haspopup="dialog"
      className="radar-tap flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold"
      style={{ background: 'var(--radar-surface-2)', color: 'var(--radar-text)' }}>
      <Menu size={16} />
      <span className="max-w-[38vw] truncate">{label}</span>
    </button>
  )
}

/** Panneau de navigation plein écran (feuille iOS glissant depuis la droite) qui remplace
 *  la barre d'onglets : scale sans limite de largeur et libère la tête d'écran. */
export function RadarMenu<T extends string>({ open, items, value, onSelect, onClose }: {
  open: boolean
  items: readonly RadarMenuItem<T>[]
  value: T
  onSelect: (v: T) => void
  onClose: () => void
}) {
  // Fermeture au bouton « retour » Android / geste iOS : le menu est un état d'écran.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Vues radarPrice">
      <button className="absolute inset-0" aria-label="Fermer le menu" onClick={onClose}
        style={{ background: 'rgba(0, 0, 0, 0.55)', backdropFilter: 'blur(2px)' }} />
      <nav className="radar-menu-panel radar-safe-top radar-safe-bottom relative flex w-[78vw] max-w-[320px] flex-col gap-1 overflow-y-auto px-3"
        style={{ background: 'var(--radar-surface)', borderLeft: '0.5px solid var(--radar-hair)' }}>
        <div className="mb-1 flex items-center justify-between px-2 pt-1">
          <span className="radar-rounded text-[17px] font-bold">Vues</span>
          <button onClick={onClose} aria-label="Fermer" className="radar-tap grid h-9 w-9 place-items-center rounded-full"
            style={{ background: 'var(--radar-surface-2)', color: 'var(--radar-text-2)' }}>
            <X size={16} />
          </button>
        </div>
        {items.map(({ value: v, labelKey, icon: Icon, hint }) => {
          const active = v === value
          return (
            <button key={v} aria-current={active ? 'page' : undefined} onClick={() => { onSelect(v); onClose() }}
              className="radar-tap flex items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] font-semibold"
              style={{
                background: active ? 'var(--radar-accent)' : 'transparent',
                color: active ? '#fff' : 'var(--radar-text)',
              }}>
              <Icon size={18} style={{ color: active ? '#fff' : 'var(--radar-accent-2)' }} />
              <span className="flex-1 truncate">{t(labelKey)}</span>
              {hint && (
                <span className="shrink-0 text-[11px] font-medium"
                  style={{ color: active ? 'rgba(255,255,255,0.75)' : 'var(--radar-text-3)' }}>{hint}</span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
