// Palette de commandes globale (⌘K / Ctrl+K) : recherche et navigation entre les
// modules + actions rapides. Montée une fois dans ProtectedRoute, disponible partout.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, CornerDownLeft } from 'lucide-react'
import { useAccessLoading, useIsPending, useIsBlocked } from '@/features/access/useAccess'
import { usePaletteCommands, filterCommands, PALETTE_GROUPS } from './usePaletteCommands'
import { useTranslation } from '@/lib/i18n'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const close = useCallback(() => setOpen(false), [])
  const commands = usePaletteCommands(close, open)
  const { t } = useTranslation()

  const accessLoading = useAccessLoading()
  const pending = useIsPending()
  const blocked = useIsBlocked()
  const disabled = accessLoading || pending || blocked

  // ⌘K / Ctrl+K : toggle global (sauf compte bloqué/en attente).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (!disabled) setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [disabled])

  // Reset à l'ouverture + focus input.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelected(0)
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(focusTimer)
  }, [open])

  const filtered = useMemo(() => filterCommands(commands, query), [commands, query])
  // Regroupement sur l'ID (stable), en-tête traduit à l'affichage.
  const groups = useMemo(
    () => PALETTE_GROUPS
      .map((g) => ({ ...g, items: filtered.filter((c) => c.groupId === g.id) }))
      .filter((g) => g.items.length > 0),
    [filtered],
  )

  if (!open) return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      filtered[selected]?.run()
    }
  }

  // Index global d'un item dans `filtered` (la sélection clavier traverse les groupes).
  let flatIdx = -1

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={t('palette.title')}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" onClick={close} aria-hidden="true" />
      <div className="absolute left-1/2 top-[18%] -translate-x-1/2 w-[min(560px,calc(100vw-2rem))]">
        <div className="bg-surface-2 border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center gap-2.5 px-4 border-b border-white/[0.06]">
            <Search className="w-4 h-4 text-white/30 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setSelected(0)
              }}
              onKeyDown={onKeyDown}
              placeholder={t('palette.placeholder')}
              className="flex-1 bg-transparent py-3.5 text-[14px] text-white placeholder:text-white/25 outline-none"
            />
            <kbd className="text-[10px] text-white/25 border border-white/10 rounded px-1.5 py-0.5 shrink-0">{t('palette.esc')}</kbd>
          </div>

          <div className="max-h-[320px] overflow-y-auto py-2">
            {filtered.length === 0 && (
              <div className="px-4 py-6 text-center text-[13px] text-white/30">{t('palette.noResults', { query })}</div>
            )}
            {groups.map((group) => (
              <div key={group.id}>
                <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wider text-white/25">{t(group.labelKey)}</div>
                {group.items.map((cmd) => {
                  flatIdx++
                  const idx = flatIdx
                  const active = idx === selected
                  const Icon = cmd.icon
                  return (
                    <button
                      key={cmd.id}
                      onClick={cmd.run}
                      onMouseMove={() => setSelected(idx)}
                      className={`w-full flex items-center gap-2.5 px-4 py-2 text-[13px] transition-colors
                        ${active ? 'bg-white/[0.06] text-white' : 'text-white/55'}`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 opacity-70 ${cmd.accent ?? ''}`} />
                      <span className="flex-1 text-left">{cmd.label}</span>
                      {active && <CornerDownLeft className="w-3.5 h-3.5 text-white/25 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="px-4 py-2 border-t border-white/[0.06] text-[10px] text-white/25 flex gap-3">
            <span>↑↓ {t('palette.hint.navigate')}</span>
            <span>↵ {t('palette.hint.open')}</span>
            <span>⌘K {t('palette.hint.close')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
