import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useHelpStore } from './help.store'
import { suggestWords, searchSections, type SearchHit } from './searchIndex'

const MAX_SUGGESTIONS = 6
const MAX_HITS = 8

export function HelpSearch() {
  const goToSection = useHelpStore((s) => s.goToSection)
  const setSearchQuery = useHelpStore((s) => s.setSearchQuery)
  const [query, setQueryLocal] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const setQuery = (q: string) => {
    setQueryLocal(q)
    setSearchQuery(q)
  }

  const trimmed = query.trim()

  const suggestions = useMemo(
    () => (trimmed ? suggestWords(trimmed, MAX_SUGGESTIONS) : []),
    [trimmed],
  )

  const hits = useMemo(() => (trimmed ? searchSections(trimmed, MAX_HITS) : []), [trimmed])

  type Item =
    | { kind: 'word'; word: string }
    | { kind: 'hit'; hit: SearchHit }

  const items = useMemo<Item[]>(
    () => [
      ...suggestions.map((word) => ({ kind: 'word' as const, word })),
      ...hits.map((hit) => ({ kind: 'hit' as const, hit })),
    ],
    [suggestions, hits],
  )

  useEffect(() => {
    setActiveIdx(0)
  }, [trimmed])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const select = (item: Item) => {
    if (item.kind === 'word') {
      setQuery(item.word)
      inputRef.current?.focus()
    } else {
      goToSection(item.hit.sectionId)
      setOpen(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || items.length === 0) {
      if (e.key === 'Enter' && hits.length > 0) {
        goToSection(hits[0].sectionId)
        setOpen(false)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(items.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[activeIdx]
      if (item) select(item)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const showDropdown = open && trimmed.length > 0 && items.length > 0

  return (
    <div ref={containerRef} className="relative flex-1">
      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Rechercher dans l'aide…"
        className="help-search-input w-full bg-white/5 border border-white/10 focus:border-indigo-500
          rounded-md pl-7 pr-7 py-1.5 text-xs text-white placeholder:text-white/30
          focus:outline-none transition-colors"
      />
      {query && (
        <button
          type="button"
          onClick={() => {
            setQuery('')
            inputRef.current?.focus()
          }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-white/30 hover:text-white/70 hover:bg-white/10"
          aria-label="Effacer la recherche"
        >
          <X className="w-3 h-3" />
        </button>
      )}

      {showDropdown && (
        <div
          className="absolute left-0 right-0 top-full mt-1 z-50
            bg-[#1a1a1a] border border-white/10 rounded-md shadow-2xl
            max-h-[60vh] overflow-y-auto"
        >
          {suggestions.length > 0 && (
            <div className="py-1">
              <div className="px-2.5 pt-1.5 pb-1 text-[9px] uppercase tracking-wider text-white/40">
                Suggestions
              </div>
              {suggestions.map((word, i) => {
                const itemIdx = i
                const isActive = itemIdx === activeIdx
                return (
                  <button
                    key={`w-${word}`}
                    type="button"
                    onMouseEnter={() => setActiveIdx(itemIdx)}
                    onClick={() => select({ kind: 'word', word })}
                    className={`w-full flex items-center gap-2 px-2.5 py-1 text-[11px] text-left ${
                      isActive ? 'bg-indigo-500/15 text-indigo-200' : 'text-white/70 hover:bg-white/5'
                    }`}
                  >
                    <Search className="w-3 h-3 text-white/30 shrink-0" />
                    <Highlighted text={word} match={trimmed} />
                  </button>
                )
              })}
            </div>
          )}
          {hits.length > 0 && (
            <div className="py-1 border-t border-white/5">
              <div className="px-2.5 pt-1.5 pb-1 text-[9px] uppercase tracking-wider text-white/40">
                Résultats
              </div>
              {hits.map((hit, i) => {
                const itemIdx = suggestions.length + i
                const isActive = itemIdx === activeIdx
                return (
                  <button
                    key={`h-${hit.sectionId}-${i}`}
                    type="button"
                    onMouseEnter={() => setActiveIdx(itemIdx)}
                    onClick={() => select({ kind: 'hit', hit })}
                    className={`w-full flex flex-col gap-0.5 px-2.5 py-1.5 text-left ${
                      isActive ? 'bg-indigo-500/10' : 'hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[9px] uppercase tracking-wider text-indigo-400/80">
                        {hit.category}
                      </span>
                      <span
                        className={`text-[11px] font-medium ${
                          isActive ? 'text-white' : 'text-white/80'
                        }`}
                      >
                        {hit.sectionTitle}
                      </span>
                    </div>
                    <Snippet hit={hit} />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Highlighted({ text, match }: { text: string; match: string }) {
  const lower = text.toLowerCase()
  const m = match.trim().toLowerCase()
  if (!m) return <span>{text}</span>
  const idx = lower.indexOf(m)
  if (idx === -1) return <span>{text}</span>
  return (
    <span>
      {text.slice(0, idx)}
      <mark className="bg-indigo-500/30 text-indigo-200 rounded-sm px-0.5">
        {text.slice(idx, idx + m.length)}
      </mark>
      {text.slice(idx + m.length)}
    </span>
  )
}

function Snippet({ hit }: { hit: SearchHit }) {
  const before = hit.snippet.slice(0, hit.matchStart)
  const match = hit.snippet.slice(hit.matchStart, hit.matchEnd)
  const after = hit.snippet.slice(hit.matchEnd)
  return (
    <span className="text-[10px] text-white/50 leading-snug line-clamp-2">
      {before}
      <mark className="bg-indigo-500/30 text-indigo-200 rounded-sm px-0.5">{match}</mark>
      {after}
    </span>
  )
}
