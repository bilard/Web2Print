// Sélecteur du module BI : un popover maison, fermé au clic extérieur, avec recherche dès
// que la liste dépasse une dizaine d'entrées.
//
// ⚠⚠ Aucun `<select>` natif dans le module (spec lot 2, D5) : il n'affiche ni groupes
// lisibles, ni recherche, et une centaine de mesures dérivées y devient impraticable. Le
// motif reprend celui d'`AiProviderCard`, éprouvé sur ~300 modèles.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

export interface PickerOption {
  id: string
  /** Libellé DÉJÀ traduit : le picker ne connaît pas le catalogue de ses appelants. */
  label: string
  /** Titre de section (le nom de la colonne, pour les mesures dérivées). */
  group?: string
}

/** Au-delà, la liste ne se parcourt plus à l'œil : le champ de recherche apparaît. */
const SEARCH_THRESHOLD = 10

export function BiPicker({ label, value, options, onChange, hint }: {
  label: string
  /** Phrase d'aide au survol : à quoi sert ce choix. Un sélecteur dont on ne devine pas
   *  l'effet se lit comme un réglage au hasard. */
  hint?: string
  value: string
  options: PickerOption[]
  onChange: (id: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery('') }
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => `${o.group ?? ''} ${o.label}`.toLowerCase().includes(q))
  }, [options, query])

  // Groupes dans l'ORDRE reçu : les mesures de l'application d'abord, les colonnes ensuite.
  const groups = useMemo(() => {
    const out: { name: string | undefined; items: PickerOption[] }[] = []
    for (const o of filtered) {
      const last = out[out.length - 1]
      if (last && last.name === o.group) last.items.push(o)
      else out.push({ name: o.group, items: [o] })
    }
    return out
  }, [filtered])

  const selected = options.find((o) => o.id === value)

  return (
    <div className="flex flex-col gap-1 min-w-0" ref={ref}>
      <span className="text-[10px] uppercase tracking-wider text-white/35">{label}</span>
      <div className="relative">
        <button
          type="button" onClick={() => setOpen((v) => !v)} title={hint}
          className="w-full flex items-center gap-1.5 bg-well border border-white/10 rounded-lg px-2 py-1 text-xs text-white hover:border-white/20 transition-colors"
        >
          <span className="truncate max-w-[180px]">{selected?.label ?? '—'}</span>
          <ChevronDown className="w-3 h-3 text-white/40 shrink-0" />
        </button>

        {open && (
          <div className="absolute z-[60] mt-1 min-w-full w-max max-w-[280px] bg-surface border border-white/10 rounded-lg shadow-xl flex flex-col max-h-72">
            {options.length > SEARCH_THRESHOLD && (
              <div className="sticky top-0 p-1.5 border-b border-white/5 bg-surface">
                <div className="flex items-center gap-1.5 bg-white/5 rounded-md px-2 py-1.5">
                  <Search className="w-3 h-3 text-white/30 shrink-0" />
                  <input
                    type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('bi.pick.search')} autoFocus
                    className="flex-1 bg-transparent text-xs text-white/80 placeholder:text-white/25 focus:outline-none min-w-0"
                  />
                </div>
              </div>
            )}
            <div className="overflow-y-auto py-1">
              {groups.length === 0 && (
                <p className="px-2.5 py-2 text-[10px] text-white/30">{t('bi.pick.none')}</p>
              )}
              {groups.map((g) => (
                <div key={g.name ?? '_'}>
                  {g.name && (
                    <p className="px-2.5 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wider text-white/30 truncate">
                      {g.name}
                    </p>
                  )}
                  {g.items.map((o) => (
                    <button
                      key={o.id} type="button"
                      onClick={() => { onChange(o.id); setOpen(false); setQuery('') }}
                      className={`w-full text-left px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/5 transition-colors ${
                        o.id === value ? 'bg-white/[0.06]' : ''
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
