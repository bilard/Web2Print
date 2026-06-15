// src/features/workflows/registry/GSheetsFormulaModal.tsx
// Popup confortable pour gérer les colonnes-formule de l'export Google Sheets :
// éditeur large (en-tête + formule avec autocomplétion) + panneau de référence
// (colonnes disponibles, fonctions courantes).
import { createPortal } from 'react-dom'
import { useEffect, useMemo, useState } from 'react'
import { X, FunctionSquare, Plus, Search } from 'lucide-react'
import { GSheetsFormulaColumns } from './GSheetsFormulaColumns'
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
  const filteredGroups = useMemo(() => {
    const q = funcQuery.trim().toLowerCase()
    return GSHEETS_FUNCTION_GROUPS.map((g) => ({
      cat: g.cat,
      fns: q
        ? g.fns.filter((f) => f.name.toLowerCase().includes(q) || f.hint.toLowerCase().includes(q))
        : g.fns,
    })).filter((g) => g.fns.length > 0)
  }, [funcQuery])

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-[820px] max-w-[96vw] max-h-[88vh] bg-surface-2 border border-neutral-800 rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <FunctionSquare className="w-4 h-4 text-indigo-400" />
            Colonnes formule — Google Sheets
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-white/5 text-neutral-400 hover:text-white"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-auto p-4 grid grid-cols-1 md:grid-cols-[1fr_240px] gap-5">
          {/* Éditeur (large) */}
          <div className="min-w-0">
            <GSheetsFormulaColumns value={value} onChange={onChange} columns={columns} />
          </div>

          {/* Panneau de référence */}
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
                    <span className="ml-auto text-[9px] text-neutral-600 group-hover:text-neutral-400 truncate max-w-[90px]">{t.hint}</span>
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-neutral-600 mt-1 leading-snug">
                Insère une colonne pré-remplie — remplace ensuite <code>{'{col1}'}</code>… par tes colonnes.
              </p>
            </div>

            <div>
              <h4 className="uppercase tracking-wider text-neutral-500 mb-1.5">Colonnes disponibles</h4>
              {columns.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {columns.map((c) => (
                    <span
                      key={c}
                      className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-mono text-[10px]"
                      title="Référence dans une formule"
                    >
                      {'{'}{c}{'}'}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-neutral-600 italic leading-snug">
                  Lance le workflow une fois pour lister les colonnes du node amont.
                </p>
              )}
            </div>

            <div>
              <h4 className="uppercase tracking-wider text-neutral-500 mb-1.5">
                Fonctions Google Sheets ({GSHEETS_FUNCTIONS.length})
              </h4>
              <div className="relative mb-1.5">
                <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
                <input
                  value={funcQuery}
                  onChange={(e) => setFuncQuery(e.target.value)}
                  placeholder="Filtrer une fonction…"
                  className="w-full pl-6 pr-2 py-1 text-[10px] bg-well border border-neutral-700 rounded text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-indigo-500/60"
                />
              </div>
              <div className="space-y-2 max-h-56 overflow-auto pr-1">
                {filteredGroups.length === 0 ? (
                  <p className="text-neutral-600 italic text-[10px]">Aucune fonction</p>
                ) : (
                  filteredGroups.map((g) => (
                    <div key={g.cat}>
                      <div className="text-[9px] uppercase tracking-wider text-indigo-300/70 sticky top-0 bg-surface-2 py-0.5">
                        {g.cat}
                      </div>
                      <ul className="space-y-0.5">
                        {g.fns.map((f) => (
                          <li key={f.name} className="flex items-baseline gap-2">
                            <span className="font-mono text-cyan-300 text-[10px] shrink-0">{f.name}()</span>
                            <span className="text-neutral-600 text-[10px] truncate">{f.hint}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
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
