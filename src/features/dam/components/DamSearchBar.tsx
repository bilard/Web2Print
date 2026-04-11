import { useCallback, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useDamStore } from '../../../stores/dam.store'
import { useDamSearch } from '../hooks/useDamSearch'
import { useDamAutocomplete } from '../hooks/useDamAutocomplete'

/**
 * Rend un label d'autocomplétion avec le préfixe saisi en gras,
 * à la manière de la barre de recherche unsplash.com.
 */
function HighlightedSuggestion({ term, query }: { term: string; query: string }) {
  const lowerTerm = term.toLowerCase()
  const lowerQuery = query.trim().toLowerCase()
  const idx = lowerQuery ? lowerTerm.indexOf(lowerQuery) : -1

  if (idx === -1 || !lowerQuery) {
    return <span>{term}</span>
  }

  return (
    <span>
      {term.slice(0, idx)}
      <span className="font-semibold text-white">{term.slice(idx, idx + lowerQuery.length)}</span>
      {term.slice(idx + lowerQuery.length)}
    </span>
  )
}

export function DamSearchBar() {
  const { query, setQuery } = useDamStore()
  const { search } = useDamSearch()
  const {
    suggestions,
    open,
    setOpen,
    activeIndex,
    moveActive,
    resetActive,
    onInputChange,
  } = useDamAutocomplete()
  const [inputValue, setInputValue] = useState(query)
  const inputRef = useRef<HTMLInputElement>(null)

  const hasSuggestions = suggestions.length > 0

  const handleChange = useCallback(
    (value: string) => {
      setInputValue(value)
      onInputChange(value)
      setOpen(true)
    },
    [onInputChange, setOpen]
  )

  const handleSubmit = useCallback(
    (term?: string) => {
      const q = term ?? inputValue
      setInputValue(q)
      setQuery(q)
      setOpen(false)
      resetActive()
      search()
    },
    [inputValue, setQuery, search, setOpen, resetActive]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (!open) setOpen(true)
        if (hasSuggestions) moveActive(1)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (hasSuggestions) moveActive(-1)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (activeIndex >= 0 && suggestions[activeIndex]) {
          handleSubmit(suggestions[activeIndex])
        } else {
          handleSubmit()
        }
        return
      }
      if (e.key === 'Escape') {
        setOpen(false)
        resetActive()
      }
    },
    [open, hasSuggestions, moveActive, setOpen, activeIndex, suggestions, handleSubmit, resetActive]
  )

  const handleClear = useCallback(() => {
    setInputValue('')
    setQuery('')
    setOpen(false)
    resetActive()
    onInputChange('')
    inputRef.current?.focus()
  }, [setQuery, setOpen, resetActive, onInputChange])

  const showDropdown = useMemo(
    () => open && hasSuggestions,
    [open, hasSuggestions]
  )

  return (
    <div className="relative">
      <div className="flex items-center bg-[#111] border border-white/10 rounded-lg h-9 px-3 gap-2 focus-within:border-indigo-500/50">
        <Search className="w-4 h-4 text-white/30 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Rechercher"
          className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls="dam-autocomplete-list"
          aria-activedescendant={activeIndex >= 0 ? `dam-suggestion-${activeIndex}` : undefined}
          role="combobox"
        />
        {inputValue && (
          <button
            onClick={handleClear}
            className="text-white/30 hover:text-white/60"
            aria-label="Effacer la recherche"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {showDropdown && (
        <ul
          id="dam-autocomplete-list"
          role="listbox"
          className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-white/10 rounded-lg py-2 z-50 shadow-xl overflow-hidden"
        >
          {suggestions.map((s, i) => {
            const active = i === activeIndex
            return (
              <li
                key={s}
                id={`dam-suggestion-${i}`}
                role="option"
                aria-selected={active}
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleSubmit(s)
                }}
                onMouseEnter={() => moveActive(i - activeIndex)}
                className={`px-4 py-2 text-sm cursor-pointer transition-colors ${
                  active ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5'
                }`}
              >
                <HighlightedSuggestion term={s} query={inputValue} />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
