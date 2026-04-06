import { useState, useRef, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { useTaxonomyStore } from '@/stores/taxonomy.store'
import { getBreadcrumb, findPath } from '@/features/taxonomy/taxonomyUtils'
import type { Taxonomy } from '@/features/taxonomy/types'

interface TaxonomySearchBarProps {
  taxonomy: Taxonomy | null
}

interface SearchResult {
  nodeId: string
  label: string
  breadcrumb: string
}

export function TaxonomySearchBar({ taxonomy }: TaxonomySearchBarProps) {
  const { searchQuery, setSearch, expandAll, setHighlighted } = useTaxonomyStore()
  const [results, setResults] = useState<SearchResult[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!taxonomy || searchQuery.length < 2) {
      setResults([])
      setShowDropdown(false)
      return
    }
    const q = searchQuery.toLowerCase()
    const matched: SearchResult[] = Object.values(taxonomy.nodes)
      .filter((n) => n.label.toLowerCase().includes(q))
      .slice(0, 12)
      .map((n) => ({
        nodeId: n.id,
        label: n.label,
        breadcrumb: getBreadcrumb(taxonomy.nodes, n.id),
      }))
    setResults(matched)
    setShowDropdown(matched.length > 0)
  }, [searchQuery, taxonomy])

  const handleSelect = (nodeId: string) => {
    if (!taxonomy) return
    const path = findPath(taxonomy.nodes, nodeId)
    expandAll(path)
    setHighlighted(nodeId)
    setShowDropdown(false)
    setTimeout(() => {
      document.getElementById(`taxonomy-node-${nodeId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }, 100)
  }

  const handleClear = () => {
    setSearch('')
    setHighlighted(null)
    setShowDropdown(false)
    inputRef.current?.focus()
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 focus-within:border-indigo-500/50 transition-colors">
        <Search className="w-3.5 h-3.5 text-white/25 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Rechercher un nœud…"
          value={searchQuery}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          className="flex-1 bg-transparent text-[12px] text-white/70 placeholder:text-white/25 outline-none"
        />
        {searchQuery && (
          <button
            onClick={handleClear}
            className="text-white/25 hover:text-white/60 transition-colors"
            aria-label="Effacer la recherche"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {showDropdown && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
          <div
            ref={dropdownRef}
            className="absolute top-full left-0 right-0 mt-1 z-20 bg-[#1e1e1e] border border-white/10 rounded-lg shadow-xl overflow-hidden max-h-56 overflow-y-auto"
          >
            {results.map((r) => (
              <button
                key={r.nodeId}
                onClick={() => handleSelect(r.nodeId)}
                className="w-full flex flex-col items-start px-3 py-2 hover:bg-white/[0.06] transition-colors text-left"
              >
                <span className="text-[12px] text-white/80">{r.label}</span>
                <span className="text-[10px] text-white/30 truncate w-full">{r.breadcrumb}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
