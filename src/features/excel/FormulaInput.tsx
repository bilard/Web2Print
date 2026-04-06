import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { FORMULA_FUNCTIONS } from './formulaEngine'
import type { ExcelColumn } from './types'

interface FormulaInputProps {
  value: string
  onChange: (value: string) => void
  columns: ExcelColumn[]
  textareaRef: React.RefObject<HTMLTextAreaElement>
}

interface Suggestion {
  label: string
  insert: string
  type: 'function' | 'column'
  description?: string
}

/** Detect which function the cursor is currently inside, and which arg index */
function detectCurrentFunction(text: string, cursor: number): { name: string; argIndex: number } | null {
  const before = text.slice(0, cursor)
  // Walk backward to find the nearest unmatched open paren with a function name
  let depth = 0
  let argIndex = 0
  for (let i = before.length - 1; i >= 0; i--) {
    const ch = before[i]
    if (ch === ')') depth++
    else if (ch === '(') {
      if (depth > 0) { depth--; continue }
      // Found unmatched '(' — check for function name before it
      const slice = before.slice(0, i)
      const match = slice.match(/([A-ZÀ-Ÿa-zà-ÿ_]\w*)$/)
      if (match) {
        // Count commas between this '(' and cursor to get arg index
        const insideParens = before.slice(i + 1)
        let commaDepth = 0
        for (const c of insideParens) {
          if (c === '(') commaDepth++
          else if (c === ')') commaDepth--
          else if (c === ',' && commaDepth === 0) argIndex++
        }
        return { name: match[1].toUpperCase(), argIndex }
      }
      return null
    } else if (ch === ',' && depth === 0) {
      // will be counted above
    }
  }
  return null
}

export function FormulaInput({ value, onChange, columns, textareaRef }: FormulaInputProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [wordStart, setWordStart] = useState(0)
  const [cursorPos, setCursorPos] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)

  const allSuggestions: Suggestion[] = useMemo(() => [
    ...FORMULA_FUNCTIONS.map((f) => ({
      label: f.name,
      insert: `${f.name}(`,
      type: 'function' as const,
      description: f.description,
    })),
    ...columns.map((c) => ({
      label: c.label,
      insert: `[${c.label}]`,
      type: 'column' as const,
      description: c.fieldType,
    })),
  ], [columns])

  // Syntax hint: detect current function context
  const syntaxHint = useMemo(() => {
    const ctx = detectCurrentFunction(value, cursorPos)
    if (!ctx) return null
    const fn = FORMULA_FUNCTIONS.find((f) => f.name === ctx.name)
    if (!fn) return null
    // Parse syntax params: "FUNC(param1, param2, ...)"
    const paramsMatch = fn.syntax.match(/\((.+)\)/)
    if (!paramsMatch) return { fn, params: [], activeIdx: 0 }
    const params = paramsMatch[1].split(',').map((p) => p.trim())
    return { fn, params, activeIdx: ctx.argIndex }
  }, [value, cursorPos])

  const updateSuggestions = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    const cursor = ta.selectionStart
    setCursorPos(cursor)
    const textBefore = value.slice(0, cursor)

    const match = textBefore.match(/([a-zA-ZÀ-ÿ_]\w*)$/)
    if (!match || match[1].length < 1) {
      setShowSuggestions(false)
      return
    }

    const word = match[1].toLowerCase()
    const start = cursor - match[1].length
    setWordStart(start)

    const filtered = allSuggestions.filter((s) =>
      s.label.toLowerCase().startsWith(word)
    ).slice(0, 8)

    if (filtered.length > 0) {
      setSuggestions(filtered)
      setSelectedIdx(0)
      setShowSuggestions(true)
    } else {
      setShowSuggestions(false)
    }
  }, [value, columns])

  const applySuggestion = useCallback((suggestion: Suggestion) => {
    const ta = textareaRef.current
    if (!ta) return
    const cursor = ta.selectionStart
    const before = value.slice(0, wordStart)
    const after = value.slice(cursor)
    const newValue = before + suggestion.insert + after
    onChange(newValue)
    setShowSuggestions(false)
    const newCursor = wordStart + suggestion.insert.length
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(newCursor, newCursor)
    }, 0)
  }, [value, wordStart, onChange])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i) => (i + 1) % suggestions.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx((i) => (i - 1 + suggestions.length) % suggestions.length) }
    else if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); applySuggestion(suggestions[selectedIdx]) }
    else if (e.key === 'Escape') { setShowSuggestions(false) }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
  }

  const handleSelect = () => {
    const ta = textareaRef.current
    if (ta) setCursorPos(ta.selectionStart)
  }

  useEffect(() => { updateSuggestions() }, [value, updateSuggestions])

  useEffect(() => {
    if (!menuRef.current) return
    const item = menuRef.current.children[selectedIdx] as HTMLElement
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onSelect={handleSelect}
        onClick={handleSelect}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        placeholder='Ex: [Prix] * 1.20 ou CONCAT([Prénom], " ", [Nom])'
        rows={3}
        className="w-full bg-[#141414] border border-white/10 rounded-lg px-3 py-2.5 text-sm font-mono text-white/80 placeholder-white/20 outline-none focus:border-indigo-500/50 resize-none"
      />

      {/* Syntax hint bar */}
      {syntaxHint && !showSuggestions && (
        <div className="flex items-center gap-2 mt-1 px-3 py-1.5 bg-[#252525] border border-white/[0.06] rounded-lg">
          <span className="text-[10px] font-bold text-indigo-400 font-mono shrink-0">
            {syntaxHint.fn.name}(
          </span>
          {syntaxHint.params.map((p, i) => (
            <span key={i} className="flex items-center">
              {i > 0 && <span className="text-white/20 text-[10px] mr-1">,</span>}
              <span className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${
                i === syntaxHint.activeIdx
                  ? 'bg-indigo-500/25 text-indigo-300 font-semibold'
                  : 'text-white/35'
              }`}>
                {p}
              </span>
            </span>
          ))}
          <span className="text-[10px] font-bold text-indigo-400 font-mono">)</span>
          <span className="text-[10px] text-white/25 ml-2 truncate">
            {syntaxHint.fn.description}
          </span>
        </div>
      )}

      {/* Autocomplete dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={menuRef}
          className="absolute left-0 right-0 top-full mt-1 bg-[#252525] border border-white/10 rounded-lg shadow-2xl z-50 max-h-[220px] overflow-y-auto py-1"
        >
          {suggestions.map((s, i) => (
            <button
              key={`${s.type}-${s.label}`}
              onMouseDown={(e) => { e.preventDefault(); applySuggestion(s) }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                i === selectedIdx ? 'bg-indigo-500/20' : 'hover:bg-white/5'
              }`}
            >
              <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${
                s.type === 'function' ? 'bg-violet-500/20 text-violet-400' : 'bg-emerald-500/20 text-emerald-400'
              }`}>
                {s.type === 'function' ? 'fx' : 'col'}
              </span>
              <span className="text-xs font-mono text-white/80 font-semibold">{s.label}</span>
              {s.description && (
                <span className="text-[10px] text-white/30 truncate flex-1 text-right">{s.description}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
