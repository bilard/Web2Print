import { useDamStore } from '../../../stores/dam.store'
import { DAM_CATEGORIES, DAM_COLORS } from '../types'
import { DamSearchBar } from './DamSearchBar'
import { DamSearchByImage } from './DamSearchByImage'

const SOURCES = [
  { value: 'all' as const, label: 'Toutes' },
  { value: 'pexels' as const, label: 'Pexels' },
  { value: 'unsplash' as const, label: 'Unsplash' },
]

const ORIENTATIONS = [
  { value: 'all' as const, label: 'Tout' },
  { value: 'landscape' as const, label: 'Paysage' },
  { value: 'portrait' as const, label: 'Portrait' },
  { value: 'square' as const, label: 'Carré' },
]

export function DamSidebar() {
  const { filters, setFilters } = useDamStore()

  return (
    <div className="w-[200px] bg-[#141414] border-r border-white/5 p-4 flex flex-col gap-4 overflow-y-auto shrink-0">
      <DamSearchBar />
      <DamSearchByImage />

      <div>
        <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1.5">Source</div>
        <div className="flex flex-wrap gap-1">
          {SOURCES.map((s) => (
            <button
              key={s.value}
              onClick={() => setFilters({ source: s.value })}
              className={`px-2 py-1 rounded text-[10px] transition ${
                filters.source === s.value
                  ? 'bg-indigo-500/20 text-indigo-400'
                  : 'bg-white/5 text-white/50 hover:bg-white/10'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1.5">Orientation</div>
        <div className="flex flex-wrap gap-1">
          {ORIENTATIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setFilters({ orientation: o.value })}
              className={`px-2 py-1 rounded text-[10px] transition ${
                filters.orientation === o.value
                  ? 'bg-indigo-500/20 text-indigo-400'
                  : 'bg-white/5 text-white/50 hover:bg-white/10'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1.5">Couleur dominante</div>
        <div className="flex flex-wrap gap-1.5">
          {DAM_COLORS.map((c) => (
            <button
              key={c.value}
              onClick={() => setFilters({ color: filters.color === c.value ? null : c.value })}
              className={`w-5 h-5 rounded-full border-2 transition ${
                filters.color === c.value ? 'border-indigo-400 scale-110' : 'border-transparent'
              }`}
              style={{ backgroundColor: c.hex }}
              title={c.value}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1.5">Catégories</div>
        <div className="flex flex-col gap-0.5">
          {DAM_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() =>
                setFilters({ category: filters.category === cat.id ? null : cat.id })
              }
              className={`flex items-center gap-2 px-1.5 py-1 rounded text-[11px] text-left transition ${
                filters.category === cat.id
                  ? 'bg-indigo-500/20 text-indigo-400'
                  : 'text-white/50 hover:text-white/70 hover:bg-white/5'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
