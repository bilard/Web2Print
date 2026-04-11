import { useCallback, useEffect, useRef, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../../lib/firebase/config'

const autocompleteFn = httpsCallable<{ prefix: string }, { suggestions: string[] }>(
  functions,
  'damAutocomplete'
)

/**
 * Autocomplétion pilotée par l'endpoint Unsplash (`damAutocomplete` cloud function).
 * Debounce 200ms. Les suggestions sont vidées si le préfixe fait moins de 2 caractères.
 */
export function useDamAutocomplete() {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const reqIdRef = useRef(0)

  const fetchSuggestions = useCallback(async (prefix: string) => {
    const id = ++reqIdRef.current
    try {
      const result = await autocompleteFn({ prefix })
      if (id !== reqIdRef.current) return
      setSuggestions(result.data.suggestions.slice(0, 8))
      setActiveIndex(-1)
    } catch {
      if (id !== reqIdRef.current) return
      setSuggestions([])
    }
  }, [])

  const onInputChange = useCallback(
    (value: string) => {
      clearTimeout(timerRef.current)
      const trimmed = value.trim()
      if (trimmed.length < 2) {
        reqIdRef.current++ // annule toute requête en vol
        setSuggestions([])
        setActiveIndex(-1)
        return
      }
      timerRef.current = setTimeout(() => fetchSuggestions(trimmed), 200)
    },
    [fetchSuggestions]
  )

  const moveActive = useCallback(
    (delta: number) => {
      setActiveIndex((prev) => {
        if (suggestions.length === 0) return -1
        const next = prev + delta
        if (next < 0) return suggestions.length - 1
        if (next >= suggestions.length) return 0
        return next
      })
    },
    [suggestions.length]
  )

  const resetActive = useCallback(() => setActiveIndex(-1), [])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  return {
    suggestions,
    open,
    setOpen,
    activeIndex,
    moveActive,
    resetActive,
    onInputChange,
  }
}
