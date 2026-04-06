import { evaluateFormula } from './formulaEngine'
import type { ExcelColumn, ExcelRow } from './types'

interface FormulaPreviewProps {
  formula: string
  columns: ExcelColumn[]
  rows: ExcelRow[]
  decimals?: number | null
}

export function FormulaPreview({ formula, columns, rows, decimals }: FormulaPreviewProps) {
  const previewRows = rows.slice(0, 5)

  if (!formula.trim()) {
    return (
      <div className="text-[11px] text-white/25 italic py-2">
        Saisissez une formule pour voir l'apercu
      </div>
    )
  }

  const formatResult = (result: unknown): string => {
    if (result === null || result === undefined) return '(vide)'
    if (decimals !== null && decimals !== undefined) {
      // Try numeric parsing — handles numbers stored as strings (e.g. "84,900" French format)
      const raw = typeof result === 'number' ? result : parseFloat(String(result).replace(/\s/g, '').replace(',', '.'))
      if (!isNaN(raw)) {
        return raw.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      }
    }
    return String(result)
  }

  // Find primary column for context
  const primaryCol = columns.find((c) => c.isPrimary)

  return (
    <div>
      <p className="text-[11px] text-white/40 uppercase tracking-wider mb-1.5">
        Apercu (5 premieres lignes)
      </p>
      <div className="bg-[#141414] border border-white/[0.06] rounded-lg divide-y divide-white/[0.04]">
        {previewRows.map((row, i) => {
          const result = evaluateFormula(formula, row, columns)
          const isError = typeof result === 'string' && result.startsWith('#ERREUR')
          const primaryVal = primaryCol ? row[primaryCol.key] : null
          return (
            <div
              key={row._id}
              className="flex items-center gap-3 px-3 py-2"
            >
              <span className="text-[10px] text-white/20 w-4 shrink-0">
                {i + 1}
              </span>
              {primaryVal && (
                <span className="text-[11px] text-white/30 truncate max-w-[120px] shrink-0">
                  {String(primaryVal)}
                </span>
              )}
              <span className="text-white/10 shrink-0">&rarr;</span>
              <span
                className={`text-xs font-mono truncate ${
                  isError ? 'text-red-400' : 'text-emerald-400'
                }`}
              >
                {formatResult(result)}
              </span>
            </div>
          )
        })}
        {previewRows.length === 0 && (
          <p className="text-[11px] text-white/25 italic px-3 py-3">Aucune ligne de données</p>
        )}
      </div>
    </div>
  )
}
