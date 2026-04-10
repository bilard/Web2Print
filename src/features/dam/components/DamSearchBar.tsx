import { useCallback, useRef, useState } from 'react'
import { Search, X, Clock } from 'lucide-react'
import { useDamStore } from '../../../stores/dam.store'
import { useDamSearch } from '../hooks/useDamSearch'
import { useDamAutocomplete } from '../hooks/useDamAutocomplete'

export function DamSearchBar() {
  const { query, setQuery } = useDamStore()
  const { search } = useDamSearch()
  const { suggestions, open, setOpen, onInputChange } = useDamAutocomplete()
  const [inputValue, setInputValue] = useState(query)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

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
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => search(), 50)
    },
    [inputValue, setQuery, search, setOpen]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSubmit()
      if (e.key === 'Escape') setOpen(false)
    },
    [handleSubmit, setOpen]
  )

  const handleClear = useCallback(() => {
    setInputValue('')
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }, [setQuery, setOpen])

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
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder="Rechercher des images..."
          className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
        />
        {inputValue && (
          <button onClick={handleClear} className="text-white/30 hover:text-white/60">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-white/10 rounded-lg py-1 z-50 shadow-xl">
          {suggestions.map((s) => (
            <button
              key={s}
              onMouseDown={() => handleSubmit(s)}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-white/70 hover:bg-white/5 hover:text-white text-left"
            >
              <Clock className="w-3 h-3 text-white/20" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
