// Popup confortable pour gérer les colonnes-formule de l'export Google Sheets :
// éditeur large (en-tête + formule avec autocomplétion) + panneau de référence
// (colonnes disponibles, fonctions courantes).
import { createPortal } from 'react-dom'
import { useEffect, useMemo, useState } from 'react'
import { FunctionSquare, Plus, Search } from 'lucide-react'
import { CloseButton } from '@/components/shared/CloseButton'
import { GSheetsFormulaColumns } from './GSheetsFormulaColumns'
import { formulaInsert } from './formulaInsert'
import { GSHEETS_FUNCTIONS, GSHEETS_FUNCTION_GROUPS } from '@/features/gdrive/googleSheetsFunctions'

interface Props {
  value: string
  onChange: (v: string) => void
  columns: string[]
  onClose: () => void
}

/** Modèles de formules complexes prêts à insérer (les {col1}/{col2}/… sont à
 *  remplacer par tes colonnes via l'autocomplétion). */
const FORMULA_TEMPLATES: { label: string; header: string; template: string; hint: string }[] = [
  { label: 'Écart %', header: 'Écart %', template: '=ROUND(({col1}/{col2}-1)*100; 1)', hint: 'Variation en % entre deux prix' },
  { label: 'Moins cher ?', header: 'Moins cher', template: '=IF({col1}<{col2}; "oui"; "non")', hint: 'Condition oui/non' },
  { label: 'Prix le plus bas', header: 'Min', template: '=MIN({col1}; {col2})', hint: 'Minimum de plusieurs colonnes' },
  { label: 'Recherche (VLOOKUP)', header: 'Recherche', template: '=IFERROR(VLOOKUP({cle}; Feuille2!A:B; 2; FAUX); "—")', hint: 'Va chercher une valeur dans une autre feuille' },
  { label: 'Libellé concaténé', header: 'Libellé', template: '=CONCATENATE({col1}; " — "; {col2})', hint: 'Assemble plusieurs colonnes en texte' },
  { label: 'Si vide → tiret', header: 'Sûr', template: '=IFERROR({col1}; "—")', hint: 'Évite les erreurs / cases vides' },
]

export function GSheetsFormulaModal({ value, onChange, columns, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Insère un modèle comme nouvelle colonne (ligne `En-tête = formule`).
  const insertTemplate = (t: { header: string; template: string }) => {
    const line = `${t.header} = ${t.template}`
    onChange(value.trim() ? `${value.trim()}\n${line}` : line)
  }

  const [funcQuery, setFuncQuery] = useState('')
  const [activeCat, setActiveCat] = useState('')
  const [acOpen, setAcOpen] = useState(false)
  const [acHi, setAcHi] = useState(0)

  // Insère une fonction dans le champ formule focalisé ; à défaut, crée une colonne.
  const insertFn = (name: string) => {
    if (!formulaInsert.insert(`${name}(`)) insertTemplate({ header: name, template: `=${name}(` })
  }

  // Regex « début de mot » pour le hint : « mat » matche « matériel » mais PAS « format ».
  const hintRe = useMemo(() => {
    const q = funcQuery.trim().toLowerCase()
    if (!q) return null
    return new RegExp('\\b' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  }, [funcQuery])

  // Suggestions « graphiques » du champ de recherche (combobox), classées par pertinence :
  // nom qui COMMENCE par la requête > nom qui CONTIENT > hint en début de mot (en dernier).
  const flatMatches = useMemo(() => {
    const q = funcQuery.trim().toLowerCase()
    if (!q) return []
    const pool = activeCat ? GSHEETS_FUNCTIONS.filter((f) => f.cat === activeCat) : GSHEETS_FUNCTIONS
    const scored: { f: (typeof pool)[number]; score: number }[] = []
    for (const f of pool) {
      const name = f.name.toLowerCase()
      let score = -1
      if (name.startsWith(q)) score = 0
      else if (name.includes(q)) score = 1
      else if (hintRe?.test(f.hint.toLowerCase())) score = 2
      if (score >= 0) scored.push({ f, score })
    }
    scored.sort((a, b) => a.score - b.score || a.f.name.localeCompare(b.f.name))
    return scored.slice(0, 10).map((s) => s.f)
  }, [funcQuery, activeCat, hintRe])

  const filteredGroups = useMemo(() => {
    const q = funcQuery.trim().toLowerCase()
    return GSHEETS_FUNCTION_GROUPS.filter((g) => !activeCat || g.cat === activeCat)
      .map((g) => ({
        cat: g.cat,
        fns: q
          ? g.fns.filter((f) => f.name.toLowerCase().includes(q) || hintRe?.test(f.hint.toLowerCase()))
          : g.fns,
      }))
      .filter((g) => g.fns.length > 0)
  }, [funcQuery, activeCat, hintRe])

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-[1000px] max-w-[97vw] h-[90vh] bg-surface-2 border border-neutral-800 rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <FunctionSquare className="w-4 h-4 text-indigo-400" />
            Colonnes formule — Google Sheets
          </div>
          <CloseButton onClick={onClose} title="Fermer" />
        </header>

        <div className="flex-1 min-h-0 overflow-hidden p-4 flex flex-col gap-4">
          {/* Haut : éditeur (gauche) + modèles & colonnes (droite) */}
          <div className="shrink-0 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 max-h-[45%] overflow-auto">
            <div className="min-w-0">
              <h4 className="uppercase tracking-wider text-neutral-500 text-[11px] mb-2">Colonnes</h4>
              <GSheetsFormulaColumns value={value} onChange={onChange} columns={columns} />
            </div>

            <aside className="space-y-4 text-[11px]">
              <div>
                <h4 className="uppercase tracking-wider text-neutral-500 mb-1.5">Formules complexes</h4>
                <div className="space-y-1">
                  {FORMULA_TEMPLATES.map((t) => (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => insertTemplate(t)}
                      title={`${t.hint} — ${t.template}`}
                      className="w-full flex items-center gap-1.5 px-2 py-1 rounded border border-neutral-700 bg-well hover:border-indigo-500/50 hover:bg-indigo-500/10 text-left transition-colors group"
                    >
                      <Plus className="w-3 h-3 text-indigo-400 shrink-0" />
                      <span className="text-neutral-200 truncate">{t.label}</span>
                      <span className="ml-auto text-[9px] text-neutral-600 group-hover:text-neutral-400 truncate max-w-[110px]">{t.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="uppercase tracking-wider text-neutral-500 mb-1.5">Colonnes disponibles</h4>
                {columns.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {columns.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          formulaInsert.insert(`{${c}}`)
                        }}
                        className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-mono text-[10px] hover:bg-emerald-500/20 transition-colors"
                        title={`Insérer {${c}} dans le champ formule`}
                      >
                        {'{'}{c}{'}'}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-neutral-600 italic leading-snug">
                    Lance le workflow une fois pour lister les colonnes du node amont.
                  </p>
                )}
              </div>
            </aside>
          </div>

          {/* Bas : fonctions sur toute la largeur, en colonnes (remplit la hauteur) */}
          <div className="flex-1 min-h-0 flex flex-col border-t border-neutral-800 pt-3">
            <div className="shrink-0 flex items-center gap-2 mb-2 flex-wrap">
              <h4 className="uppercase tracking-wider text-neutral-500 text-[11px]">
                Fonctions Google Sheets ({GSHEETS_FUNCTIONS.length})
              </h4>
              <select
                value={activeCat}
                onChange={(e) => setActiveCat(e.target.value)}
                className="px-1.5 py-1 text-[10px] bg-well border border-neutral-700 rounded text-neutral-200 outline-none focus:border-indigo-500/60"
                title="Filtrer par groupe de fonctions"
              >
                <option value="">Tous les groupes</option>
                {GSHEETS_FUNCTION_GROUPS.map((g) => (
                  <option key={g.cat} value={g.cat}>
                    {g.cat} ({g.fns.length})
                  </option>
                ))}
              </select>
              <div className="relative ml-auto">
                <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
                <input
                  value={funcQuery}
                  onChange={(e) => {
                    setFuncQuery(e.target.value)
                    setAcOpen(true)
                    setAcHi(0)
                  }}
                  onFocus={() => setAcOpen(true)}
                  onBlur={() => setTimeout(() => setAcOpen(false), 150)}
                  onKeyDown={(e) => {
                    if (!acOpen || flatMatches.length === 0) return
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setAcHi((i) => (i + 1) % flatMatches.length)
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setAcHi((i) => (i - 1 + flatMatches.length) % flatMatches.length)
                    } else if (e.key === 'Enter') {
                      e.preventDefault()
                      insertFn(flatMatches[acHi].name)
                    } else if (e.key === 'Escape') {
                      setAcOpen(false)
                    }
                  }}
                  placeholder="Filtrer / insérer une fonction…"
                  className="w-56 pl-6 pr-2 py-1 text-[10px] bg-well border border-neutral-700 rounded text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-indigo-500/60"
                />
                {acOpen && flatMatches.length > 0 && (
                  <ul className="absolute z-[1100] right-0 mt-1 w-72 max-h-64 overflow-auto rounded-md bg-surface-2 border border-neutral-700 shadow-xl">
                    {flatMatches.map((f, i) => (
                      <li key={f.name}>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            insertFn(f.name)
                          }}
                          className={`w-full text-left px-2 py-1.5 flex items-baseline gap-2 ${
                            i === acHi ? 'bg-indigo-500/20' : 'hover:bg-white/[0.05]'
                          }`}
                        >
                          <span className="font-mono text-cyan-300 text-[10px] shrink-0">{f.name}()</span>
                          <span className="text-neutral-500 text-[10px] truncate">{f.hint}</span>
                          <span className="ml-auto text-[8px] text-neutral-600 shrink-0">{f.cat}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto pr-1">
            {filteredGroups.length === 0 ? (
              <p className="text-neutral-600 italic text-[10px]">Aucune fonction</p>
            ) : (
              <div className="columns-2 md:columns-3 xl:columns-4 gap-x-6">
                {filteredGroups.map((g) => (
                  <div key={g.cat} className="break-inside-avoid mb-3">
                    <div className="text-[9px] uppercase tracking-wider text-indigo-300/70 mb-0.5">{g.cat}</div>
                    <ul className="space-y-0.5">
                      {g.fns.map((f) => (
                        <li key={f.name}>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault()
                              insertFn(f.name)
                            }}
                            title={`Insérer ${f.name}( dans le champ formule`}
                            className="w-full flex items-baseline gap-1.5 text-left rounded px-1 -mx-1 hover:bg-white/[0.05] transition-colors"
                          >
                            <span className="font-mono text-cyan-300 text-[10px] shrink-0">{f.name}()</span>
                            <span className="text-neutral-600 text-[10px] truncate">{f.hint}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>
        </div>

        <footer className="px-4 py-3 border-t border-neutral-800 flex items-center justify-between shrink-0">
          <p className="text-[10px] text-neutral-600">
            Formules <strong>vivantes</strong> : référence une colonne par <code>{'{nom}'}</code>, tape une
            fonction pour l'autocomplétion.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-indigo-500 hover:bg-indigo-600 text-[#fff] text-sm"
          >
            Terminé
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
