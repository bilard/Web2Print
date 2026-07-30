// Éditeur des colonnes-formule de l'export Google Sheets : liste (en-tête + formule)
// avec autocomplétion des fonctions Google Sheets ET des noms de colonnes ({col}).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { GSHEETS_FUNCTIONS } from '@/features/gdrive/googleSheetsFunctions'
import { formulaInsert } from './formulaInsert'
import { t, type TranslationKey } from '@/lib/i18n'

interface Row {
  header: string
  formula: string
  /** Format de sortie Google Sheets (clé ; '' = auto). Cf. FORMULA_FORMATS serveur. */
  format?: string
}

/** Options de format de colonne (alignées sur FORMULA_FORMATS côté serveur). */
const FORMAT_OPTIONS: { value: string; labelKey: TranslationKey }[] = [
  { value: '', labelKey: 'fmt.auto' },
  { value: 'text', labelKey: 'fmt.text' },
  { value: 'number', labelKey: 'fmt.number' },
  { value: 'percent', labelKey: 'fmt.percent' },
  { value: 'currency', labelKey: 'fmt.currency' },
  { value: 'currency_round', labelKey: 'fmt.currencyRound' },
  { value: 'accounting', labelKey: 'fmt.accounting' },
  { value: 'scientific', labelKey: 'fmt.scientific' },
  { value: 'date', labelKey: 'fmt.date' },
  { value: 'time', labelKey: 'fmt.time' },
  { value: 'datetime', labelKey: 'fmt.datetime' },
  { value: 'duration', labelKey: 'fmt.duration' },
]

/** Ferme les parenthèses (et accolades) non fermées d'une formule, dans le bon
 *  ordre imbriqué. Ignore le contenu entre guillemets. Ex. `LEFT({produit}` → `LEFT({produit})`. */
function autoCloseFormula(s: string): string {
  const stack: string[] = []
  let inStr = false
  for (const c of s) {
    if (c === '"') inStr = !inStr
    else if (!inStr) {
      if (c === '(') stack.push(')')
      else if (c === '{') stack.push('}')
      else if ((c === ')' || c === '}') && stack[stack.length - 1] === c) stack.pop()
    }
  }
  return stack.length ? s + stack.reverse().join('') : s
}

function parseRows(raw: string): Row[] {
  return String(raw || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const eq = line.indexOf('=')
      const left = eq < 0 ? line : line.slice(0, eq)
      const formula = eq < 0 ? '' : line.slice(eq + 1).trim()
      const fm = left.match(/^(.*?)\s*\[([a-z_]+)\]\s*$/) // En-tête [format]
      return { header: (fm ? fm[1] : left).trim(), format: fm ? fm[2] : '', formula }
    })
}

function serialize(rows: Row[]): string {
  return rows
    .filter((r) => r.header.trim() || r.formula.trim())
    .map((r) => `${r.header.trim()}${r.format ? ` [${r.format}]` : ''} = ${r.formula.trim()}`)
    .join('\n')
}

interface Suggestion {
  name: string
  hint: string
  kind: 'fn' | 'col'
}
interface AcState {
  /** 'fn' = on tape un nom de fonction ; 'col' = après `{` ; 'arg' = début d'argument (après `(`, `;`, opérateur). */
  mode: 'fn' | 'col' | 'arg'
  query: string
  startIdx: number
  highlight: number
}

const ARG_STARTERS = '([;,+-*/=<>&%' // caractères après lesquels un nouvel argument commence

/** Champ formule mono-ligne avec autocomplétion (fonctions GSheets + colonnes). */
function FormulaInput({
  value,
  onChange,
  columns,
}: {
  value: string
  onChange: (v: string) => void
  columns: string[]
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [ac, setAc] = useState<AcState | null>(null)
  const [focused, setFocused] = useState(false)

  const recompute = (input: HTMLInputElement) => {
    const pos = input.selectionStart ?? input.value.length
    const before = input.value.slice(0, pos)
    // 1) Après `{` non fermé → colonnes.
    const brace = before.lastIndexOf('{')
    if (brace !== -1 && !before.slice(brace + 1).includes('}')) {
      setAc({ mode: 'col', query: before.slice(brace + 1), startIdx: brace, highlight: 0 })
      return
    }
    // 2) On tape un nom de fonction (identifiant en cours).
    const m = before.match(/[A-Za-z][A-Za-z0-9_]*$/)
    if (m) {
      setAc({ mode: 'fn', query: m[0], startIdx: pos - m[0].length, highlight: 0 })
      return
    }
    // 3) Début d'argument (champ vide, ou après `(`, `;`, opérateur) → propose colonnes + fonctions.
    const tail = before.replace(/\s+$/, '')
    if (tail === '' || ARG_STARTERS.includes(tail.slice(-1))) {
      setAc({ mode: 'arg', query: '', startIdx: pos, highlight: 0 })
      return
    }
    setAc(null)
  }

  const suggestions: Suggestion[] = useMemo(() => {
    if (!ac) return []
    const cols: Suggestion[] = columns.map((c) => ({ name: c, hint: 'colonne', kind: 'col' }))
    const fns: Suggestion[] = GSHEETS_FUNCTIONS.map((f) => ({ ...f, kind: 'fn' }))
    if (ac.mode === 'col') {
      const q = ac.query.toLowerCase()
      return cols.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8)
    }
    if (ac.mode === 'fn') {
      const q = ac.query.toUpperCase()
      return fns.filter((f) => f.name.startsWith(q)).slice(0, 8)
    }
    // arg : colonnes d'abord (souvent ce qu'on référence), puis fonctions.
    return [...cols, ...fns].slice(0, 10)
  }, [ac, columns])

  const accept = (s: Suggestion) => {
    const input = ref.current
    if (!input || !ac) return
    const pos = input.selectionStart ?? value.length
    const insert = s.kind === 'fn' ? `${s.name}(` : `{${s.name}}`
    const before = value.slice(0, ac.startIdx) + insert
    onChange(before + value.slice(pos))
    setAc(null)
    requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(before.length, before.length)
      // Après une fonction (`DATE(`), propose tout de suite les arguments (colonnes/fonctions).
      if (s.kind === 'fn') recompute(input)
    })
  }

  // Insertion externe (clic depuis le popup) au curseur — via refs pour éviter
  // toute closure obsolète (lit la valeur live du DOM, onChange courant).
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const doInsert = (text: string) => {
    const input = ref.current
    if (!input) return
    const cur = input.value
    const pos = input.selectionStart ?? cur.length
    const before = cur.slice(0, pos) + text
    onChangeRef.current(before + cur.slice(pos))
    requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(before.length, before.length)
      recompute(input)
    })
  }
  const insertRef = useRef(doInsert)
  insertRef.current = doInsert
  const stableInsert = useRef((t: string) => insertRef.current(t)).current
  useEffect(() => () => formulaInsert.clearIf(stableInsert), [stableInsert])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!ac || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAc({ ...ac, highlight: (ac.highlight + 1) % suggestions.length })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAc({ ...ac, highlight: (ac.highlight - 1 + suggestions.length) % suggestions.length })
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      accept(suggestions[ac.highlight])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setAc(null)
    }
  }

  return (
    <div className="relative flex-1 min-w-0">
      <input
        ref={ref}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          recompute(e.target)
        }}
        onFocus={() => {
          setFocused(true)
          formulaInsert.setActive(stableInsert)
        }}
        onClick={(e) => recompute(e.currentTarget)}
        onKeyUp={(e) => {
          if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) recompute(e.currentTarget)
        }}
        onBlur={(e) => {
          // À la sortie du champ : ferme automatiquement la/les parenthèse(s) (et accolades) non fermées.
          const cur = e.currentTarget.value
          const closed = autoCloseFormula(cur)
          if (closed !== cur) onChange(closed)
          setTimeout(() => {
            setFocused(false)
            setAc(null)
          }, 120)
        }}
        onKeyDown={onKeyDown}
        placeholder="={price} - {price_concurrent}"
        className="w-full bg-background border border-neutral-700 rounded px-2 py-1.5 text-[12px] font-mono text-white outline-none focus:border-indigo-500"
      />
      {focused && ac && (suggestions.length > 0 || ac.mode === 'col') && (
        <ul className="absolute z-50 left-0 right-0 mt-1 max-h-52 overflow-auto rounded-md bg-surface-2 border border-neutral-700 shadow-xl">
          {suggestions.length === 0 && ac.mode === 'col' && (
            <li className="px-2 py-1.5 text-[10px] text-neutral-500 italic leading-snug">
              Aucune colonne connue. Lance le workflow une fois pour les lister, ou saisis le nom de colonne entre accolades.
            </li>
          )}
          {suggestions.map((s, i) => (
            <li key={s.name}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  accept(s)
                }}
                className={`w-full text-left px-2 py-1.5 flex items-center justify-between gap-2 ${
                  i === ac.highlight ? 'bg-indigo-500/20' : 'hover:bg-white/[0.05]'
                }`}
              >
                <span className={`text-[12px] font-mono ${s.kind === 'fn' ? 'text-cyan-300' : 'text-emerald-300'}`}>
                  {s.kind === 'fn' ? `${s.name}()` : `{${s.name}}`}
                </span>
                <span className="text-[10px] text-neutral-500 truncate">{s.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Liste éditable de colonnes-formule (sérialisée en `En-tête = formule` par ligne). */
export function GSheetsFormulaColumns({
  value,
  onChange,
  columns,
}: {
  value: string
  onChange: (v: string) => void
  columns: string[]
}) {
  const rows = parseRows(value)
  const editable = [...rows, { header: '', formula: '', format: '' }] // ligne fantôme pour en ajouter une

  const setRow = (i: number, patch: Partial<Row>) => {
    const next = editable.map((r, j) => (j === i ? { ...r, ...patch } : r))
    onChange(serialize(next))
  }
  const removeRow = (i: number) => onChange(serialize(rows.filter((_, j) => j !== i)))

  return (
    <div className="space-y-1.5">
      {editable.map((row, i) => {
        const ghost = i === rows.length
        return (
          <div key={i} className="flex items-center gap-1.5">
            <input
              value={row.header}
              onChange={(e) => setRow(i, { header: e.target.value })}
              placeholder={ghost ? '+ Nom de colonne' : 'En-tête'}
              className="w-28 shrink-0 bg-background border border-neutral-700 rounded px-2 py-1.5 text-[12px] text-white outline-none focus:border-indigo-500"
            />
            <span className="text-neutral-600 text-xs">=</span>
            <FormulaInput value={row.formula} onChange={(v) => setRow(i, { formula: v })} columns={columns} />
            <select
              value={row.format ?? ''}
              onChange={(e) => setRow(i, { format: e.target.value })}
              title="Format de sortie de la colonne dans Google Sheets"
              className="w-24 shrink-0 bg-background border border-neutral-700 rounded px-1 py-1.5 text-[10px] text-white/70 outline-none focus:border-indigo-500"
            >
              {FORMAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
              ))}
            </select>
            {!ghost && (
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="shrink-0 p-1 text-neutral-600 hover:text-red-400"
                aria-label="Supprimer la colonne"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {ghost && <Plus className="w-3.5 h-3.5 text-neutral-700 shrink-0" aria-hidden="true" />}
          </div>
        )
      })}
      <p className="text-[10px] text-neutral-600 leading-snug">
        {t('gsf.liveNoteColumns')}
      </p>
    </div>
  )
}
