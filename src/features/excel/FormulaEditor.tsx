import { useState, useRef } from 'react'
import { Save, FunctionSquare } from 'lucide-react'
import { CloseButton } from '@/components/shared/CloseButton'
import type { ExcelColumn, ExcelRow } from './types'
import { FIELD_TYPES } from './types'
import { FieldTypeIcon } from './FieldTypeIcon'
import { FormulaFunctionList } from './FormulaFunctionList'
import { FormulaPreview } from './FormulaPreview'
import { FormulaInput } from './FormulaInput'
import { t } from '@/lib/i18n'

type ResultType = 'auto' | 'number' | 'text' | 'percent'

/** Remplace les références [clé_technique] par [label_humain] pour l'affichage */
function normalizeFormulaDisplay(formula: string, columns: ExcelColumn[]): string {
  return formula.replace(/\[([^\]]+)\]/g, (_match, ref: string) => {
    const col = columns.find((c) => c.key === ref && c.label !== ref)
    return col ? `[${col.label}]` : `[${ref}]`
  })
}

interface FormulaEditorProps {
  columnKey: string
  currentFormula: string
  columnLabel?: string
  currentResultType?: ResultType
  currentDecimals?: number | null
  columns: ExcelColumn[]
  rows: ExcelRow[]
  onSave: (formula: string, label: string, resultType: ResultType, decimals: number | null) => void
  onClose: () => void
}

export function FormulaEditor({
  columnKey, currentFormula, columnLabel, currentResultType, currentDecimals, columns, rows, onSave, onClose,
}: FormulaEditorProps) {
  const [formula, setFormula] = useState(() => normalizeFormulaDisplay(currentFormula || '', columns))
  const [label, setLabel] = useState(columnLabel || 'Calcul')
  const [resultType, setResultType] = useState<ResultType>(currentResultType ?? 'auto')
  const [decimals, setDecimals] = useState<number>(currentDecimals ?? 0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const insertAtCursor = (text: string) => {
    const ta = textareaRef.current
    if (!ta) { setFormula((f) => f + text); return }
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const newFormula = formula.slice(0, start) + text + formula.slice(end)
    setFormula(newFormula)
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(start + text.length, start + text.length)
    }, 0)
  }

  const availableColumns = columns.filter((c) => c.key !== columnKey)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-2 border border-white/10 rounded-xl shadow-2xl w-[860px] h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
          <FunctionSquare className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-semibold text-white/90 flex-1">{t('xl.computedField')}</h2>
          <CloseButton onClick={onClose} />
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 flex">
          {/* Left panel */}
          <div className="flex-1 p-4 space-y-4 overflow-y-auto">
            {/* Field name + result type */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[11px] text-white/40 uppercase tracking-wider mb-1.5 block">
                  Nom du champ
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="w-full bg-surface-2 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 outline-none focus:border-indigo-500/50"
                  placeholder={t('xl.computedField.placeholder')}
                />
              </div>
              <div className="w-40">
                <label className="text-[11px] text-white/40 uppercase tracking-wider mb-1.5 block">
                  {t('xl.fe.resultType')}
                </label>
                <select
                  value={resultType}
                  onChange={(e) => setResultType(e.target.value as ResultType)}
                  className="w-full bg-surface-2 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 outline-none focus:border-indigo-500/50"
                >
                  <option value="auto">Auto</option>
                  <option value="number">Nombre</option>
                  <option value="percent">Pourcentage</option>
                  <option value="text">Texte</option>
                </select>
              </div>
              {(resultType === 'number' || resultType === 'percent') && (
                <div className="w-28">
                  <label className="text-[11px] text-white/40 uppercase tracking-wider mb-1.5 block">
                    {t('xl.fe.decimals')}
                  </label>
                  <select
                    value={decimals}
                    onChange={(e) => setDecimals(parseInt(e.target.value))}
                    className="w-full bg-surface-2 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 outline-none focus:border-indigo-500/50"
                  >
                    {[0, 1, 2, 3, 4, 5].map((d) => (
                      <option key={d} value={d}>{d} {d === 0 ? '(entier)' : ''}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Formula input with autocomplete */}
            <div>
              <label className="text-[11px] text-white/40 uppercase tracking-wider mb-1.5 block">
                Formule
              </label>
              <FormulaInput
                value={formula}
                onChange={setFormula}
                columns={availableColumns}
                textareaRef={textareaRef}
              />
              <p className="text-[10px] text-white/25 mt-1">
                {t('xl.fe.autocompleteHint')}
              </p>
            </div>

            {/* Available fields list */}
            <div>
              <p className="text-[11px] text-white/40 uppercase tracking-wider mb-2">
                {t('xl.fe.availableFields')}
              </p>
              <div className="bg-surface-2 border border-white/[0.06] rounded-lg divide-y divide-white/[0.04] max-h-[180px] overflow-y-auto">
                {availableColumns.map((col) => {
                  const typeDef = FIELD_TYPES.find((t) => t.id === col.fieldType)
                  return (
                    <button
                      key={col.key}
                      onClick={() => insertAtCursor(`[${col.label}]`)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-indigo-500/10 transition-colors group"
                    >
                      <FieldTypeIcon type={col.fieldType} className="w-3.5 h-3.5 text-white/30 group-hover:text-indigo-400 shrink-0" />
                      <span className="text-xs text-white/70 group-hover:text-indigo-300 flex-1 truncate">
                        {col.label}
                      </span>
                      <span className="text-[10px] text-white/25 shrink-0">
                        {typeDef?.shortLabel ?? typeDef?.label ?? col.fieldType}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Preview */}
            <FormulaPreview
              formula={formula}
              columns={columns}
              rows={rows}
              decimals={resultType === 'number' || resultType === 'percent' ? decimals : null}
              percent={resultType === 'percent'}
            />
          </div>

          {/* Right: function reference */}
          <div className="w-[300px] border-l border-white/[0.06] p-3 overflow-y-auto">
            <FormulaFunctionList onInsert={insertAtCursor} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/[0.06]">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs text-white/50 hover:text-white/70 hover:bg-white/5 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={() => onSave(formula, label, resultType, resultType === 'number' || resultType === 'percent' ? decimals : null)}
            disabled={!formula.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-[#fff] text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save className="w-3.5 h-3.5" />
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}
