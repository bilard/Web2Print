// Calendrier mensuel compact type agenda : clic sur un jour = sélection/désélection
// (multi-dates, format ISO 'YYYY-MM-DD'). Les jours passés sont désactivés (on planifie
// vers l'avant). Thémable par tokens — parité clair/sombre automatique.
import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]
/** En-têtes lundi → dimanche (semaine française). */
const DAY_HEADERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

const pad = (n: number) => String(n).padStart(2, '0')
const toIso = (y: number, mo: number, d: number) => `${y}-${pad(mo)}-${pad(d)}`

export function MiniCalendar({ selected, onToggle }: {
  /** Dates sélectionnées, ISO 'YYYY-MM-DD'. */
  selected: string[]
  onToggle: (isoDate: string) => void
}) {
  const now = new Date()
  const todayIso = toIso(now.getFullYear(), now.getMonth() + 1, now.getDate())
  const [view, setView] = useState({ y: now.getFullYear(), mo: now.getMonth() + 1 })
  const move = (delta: number) => setView((v) => {
    const t = v.y * 12 + (v.mo - 1) + delta
    return { y: Math.floor(t / 12), mo: (t % 12) + 1 }
  })

  const daysInMonth = new Date(view.y, view.mo, 0).getDate()
  // Colonne du 1ᵉʳ du mois, base lundi (getDay : 0 = dimanche).
  const firstCol = (new Date(view.y, view.mo - 1, 1).getDay() + 6) % 7
  const cells: (number | null)[] = [
    ...(Array(firstCol).fill(null) as null[]),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  const sel = new Set(selected)

  return (
    <div className="rounded border border-white/10 bg-well p-2 select-none">
      <div className="flex items-center justify-between mb-1.5">
        <button type="button" onClick={() => move(-1)} title="Mois précédent"
          className="p-1 rounded text-white/50 hover:text-white hover:bg-white/10">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs font-medium text-white capitalize">{MONTHS[view.mo - 1]} {view.y}</span>
        <button type="button" onClick={() => move(1)} title="Mois suivant"
          className="p-1 rounded text-white/50 hover:text-white hover:bg-white/10">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {DAY_HEADERS.map((h, i) => (
          <span key={`h${i}`} className="text-center text-[10px] uppercase text-white/30 py-0.5">{h}</span>
        ))}
        {cells.map((d, i) => {
          if (d == null) return <span key={`e${i}`} />
          const isoDate = toIso(view.y, view.mo, d)
          const isPast = isoDate < todayIso
          const isSelected = sel.has(isoDate)
          const isToday = isoDate === todayIso
          return (
            <button
              key={isoDate} type="button" disabled={isPast}
              onClick={() => onToggle(isoDate)}
              title={isPast ? 'Date passée' : isoDate}
              className={`h-6 rounded text-[11px] tabular-nums transition-colors ${
                isSelected ? 'bg-[#6366f1] text-[#fff] font-semibold'
                  : isPast ? 'text-white/20 cursor-default'
                    : 'text-white/80 hover:bg-white/10'
              } ${isToday && !isSelected ? 'ring-1 ring-inset ring-[#6366f1]/60' : ''}`}
            >
              {d}
            </button>
          )
        })}
      </div>
    </div>
  )
}
