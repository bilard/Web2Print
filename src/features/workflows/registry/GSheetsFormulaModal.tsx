// src/features/workflows/registry/GSheetsFormulaModal.tsx
// Popup confortable pour gérer les colonnes-formule de l'export Google Sheets :
// éditeur large (en-tête + formule avec autocomplétion) + panneau de référence
// (colonnes disponibles, fonctions courantes).
import { createPortal } from 'react-dom'
import { useEffect } from 'react'
import { X, FunctionSquare } from 'lucide-react'
import { GSheetsFormulaColumns } from './GSheetsFormulaColumns'
import { GSHEETS_FUNCTIONS } from '@/features/gdrive/googleSheetsFunctions'

interface Props {
  value: string
  onChange: (v: string) => void
  columns: string[]
  onClose: () => void
}

export function GSheetsFormulaModal({ value, onChange, columns, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
              <h4 className="uppercase tracking-wider text-neutral-500 mb-1.5">Fonctions courantes</h4>
              <ul className="space-y-0.5 max-h-64 overflow-auto pr-1">
                {GSHEETS_FUNCTIONS.map((f) => (
                  <li key={f.name} className="flex items-baseline gap-2">
                    <span className="font-mono text-cyan-300 text-[10px] shrink-0">{f.name}()</span>
                    <span className="text-neutral-600 text-[10px] truncate">{f.hint}</span>
                  </li>
                ))}
              </ul>
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
