import { useCallback, useEffect, useRef, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../../lib/firebase/config'
import { useDamStore } from '../../../stores/dam.store'

const autocompleteFn = httpsCallable<{ prefix: string }, { suggestions: string[] }>(
  functions,
  'damAutocomplete'
)

export function useDamAutocomplete() {
  const { recentSearches } = useDamStore()
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const fetchSuggestions = useCallback(
    async (prefix: string) => {
      if (prefix.length < 2) {
        setSuggestions(recentSearches.slice(0, 5))
        return
      }

      const localMatches = recentSearches
        .filter((s) => s.toLowerCase().startsWith(prefix.toLowerCase()))
        .slice(0, 3)

      try {
        const result = await autocompleteFn({ prefix })
        const remote = result.data.suggestions.filter((s) => !localMatches.includes(s))
        setSuggestions([...localMatches, ...remote].slice(0, 8))
      } catch {
        setSuggestions(localMatches)
      }
    },
    [recentSearches]
  )

  const onInputChange = useCallback(
    (value: string) => {
      clearTimeout(timerRef.current)
      if (!value.trim()) {
        setSuggestions(recentSearches.slice(0, 5))
        return
      }
      timerRef.current = setTimeout(() => fetchSuggestions(value), 200)
    },
    [fetchSuggestions, recentSearches]
  )

  useEffect(() => () => clearTimeout(timerRef.current), [])

  return { suggestions, open, setOpen, onInputChange }
}
