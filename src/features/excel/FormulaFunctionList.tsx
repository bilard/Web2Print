import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { FORMULA_FUNCTIONS, type FormulaCategory } from './formulaEngine'

const CATEGORY_LABELS: Record<FormulaCategory, string> = {
  logique: 'Logique',
  texte: 'Texte',
  math: 'Mathématiques',
  date: 'Date',
}

const CATEGORY_ORDER: FormulaCategory[] = ['math', 'texte', 'logique', 'date']

interface FormulaFunctionListProps {
  onInsert: (text: string) => void
}

export function FormulaFunctionList({ onInsert }: FormulaFunctionListProps) {
  const [openCats, setOpenCats] = useState<Set<FormulaCategory>>(new Set(['math']))
  const [search, setSearch] = useState('')

  const toggleCat = (cat: FormulaCategory) => {
    setOpenCats((prev) => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  const q = search.toLowerCase().trim()

  const grouped = useMemo(() =>
    CATEGORY_ORDER.map((cat) => ({
      cat,
      label: CATEGORY_LABELS[cat],
      funcs: FORMULA_FUNCTIONS.filter((f) =>
        f.category === cat &&
        (!q || f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q) || f.syntax.toLowerCase().includes(q))
      ),
    })).filter((g) => g.funcs.length > 0),
  [q])

  // Auto-open all categories when searching
  const isSearching = q.length > 0

  return (
    <div className="space-y-1">
      {/* Search */}
      <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.06] rounded-lg px-2.5 py-1.5 mb-2">
        <Search className="w-3.5 h-3.5 text-white/25 shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher une fonction..."
          className="bg-transparent text-xs text-white/70 placeholder-white/25 outline-none flex-1"
        />
      </div>

      <p className="text-[11px] text-white/40 uppercase tracking-wider mb-2 px-1">
        Fonctions disponibles
      </p>

      {grouped.length === 0 && (
        <p className="text-[11px] text-white/25 italic px-2 py-3">Aucune fonction trouvée</p>
      )}

      {grouped.map(({ cat, label, funcs }) => {
        const isOpen = isSearching || openCats.has(cat)
        return (
          <div key={cat}>
            <button
              onClick={() => !isSearching && toggleCat(cat)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium text-white/60 hover:bg-white/5 transition-colors"
            >
              {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              {label}
              <span className="text-white/25 ml-auto">{funcs.length}</span>
            </button>

            {isOpen && (
              <div className="ml-2 space-y-1 mb-2">
                {funcs.map((fn) => (
                  <FunctionCard key={fn.name} fn={fn} query={q} onInsert={onInsert} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function FunctionCard({ fn, query, onInsert }: {
  fn: typeof FORMULA_FUNCTIONS[number]
  query: string
  onInsert: (text: string) => void
}) {
  const highlightName = (name: string) => {
    if (!query) return name
    const idx = name.toLowerCase().indexOf(query)
    if (idx < 0) return name
    return (
      <>
        {name.slice(0, idx)}
        <span className="text-indigo-300 underline">{name.slice(idx, idx + query.length)}</span>
        {name.slice(idx + query.length)}
      </>
    )
  }

  return (
    <div className="bg-white/[0.03] rounded-lg px-3 py-2">
      <button
        onClick={() => onInsert(`${fn.name}(`)}
        className="inline-block px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-xs font-mono font-semibold hover:bg-indigo-500/30 transition-colors"
      >
        {highlightName(fn.name)}
      </button>
      <p className="text-[11px] text-white/50 mt-1">{fn.description}</p>
      <p className="text-[10px] text-white/30 font-mono mt-0.5">{fn.syntax}</p>
      <div className="mt-1 space-y-0.5">
        {fn.examples.map((ex, i) => (
          <p key={i} className="text-[10px] text-white/25">
            <span className="font-mono text-white/35">{ex.formula}</span>
            {' → '}
            <span className="text-emerald-400/60">{ex.result}</span>
          </p>
        ))}
      </div>
    </div>
  )
}
