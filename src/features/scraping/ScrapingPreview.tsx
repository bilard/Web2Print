import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { ScrapeResult } from './useFirecrawl'

interface Props {
  result: ScrapeResult
}

const isSpecsArray = (v: unknown): v is { name: string; value: string }[] =>
  Array.isArray(v) && v.length > 0 && typeof (v[0] as Record<string, unknown>)?.name === 'string'

function formatCell(v: unknown): string {
  if (v == null) return '—'
  if (isSpecsArray(v)) return v.map((s) => `${s.name}: ${s.value}`).join(' · ')
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function ScrapingPreview({ result }: Props) {
  const [showRaw, setShowRaw] = useState(false)

  if (result.rows.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-white/30">
        Aucune donnée extraite
      </div>
    )
  }

  // Detect specs columns for expanded view
  const specsRow = result.rows[0]
  const specsColumns = result.columns.filter((c) => isSpecsArray(specsRow?.[c]))
  const baseColumns = result.columns.filter((c) => !isSpecsArray(specsRow?.[c]))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/30 uppercase tracking-wider">
          Aperçu — {result.rows.length} ligne{result.rows.length > 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-indigo-400/60">{result.columns.length} colonnes</span>
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="flex items-center gap-1 text-[10px] text-white/25 hover:text-white/50 transition-colors"
          >
            {showRaw ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            JSON brut
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto max-h-72 rounded-lg border border-white/10">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="bg-white/[0.04] border-b border-white/10">
              {baseColumns.map((col) => (
                <th key={col} className="text-left px-3 py-2 text-white/50 font-medium whitespace-nowrap">
                  {col}
                </th>
              ))}
              {specsColumns.map((col) => (
                <th key={col} className="text-left px-3 py-2 text-emerald-400/50 font-medium whitespace-nowrap">
                  {col} <span className="text-[9px] text-white/20">({(specsRow?.[col] as unknown[])?.length ?? 0} specs)</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.slice(0, 20).map((row, i) => (
              <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                {baseColumns.map((col) => (
                  <td key={col} className="px-3 py-1.5 text-white/60 max-w-[200px] truncate">
                    {formatCell(row[col])}
                  </td>
                ))}
                {specsColumns.map((col) => (
                  <td key={col} className="px-3 py-1.5 text-emerald-400/60 max-w-[300px]">
                    <div className="truncate text-[10px]">
                      {isSpecsArray(row[col]) ? row[col].map((s) => s.name).join(' · ') : '—'}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {result.rows.length > 20 && (
          <div className="px-3 py-2 text-[10px] text-white/25 text-center border-t border-white/[0.04]">
            +{result.rows.length - 20} lignes supplémentaires
          </div>
        )}
      </div>

      {/* Specs détail (quand 1 seule ligne) */}
      {result.rows.length === 1 && specsColumns.length > 0 && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-1.5">
          <span className="text-[10px] text-emerald-400/60 uppercase tracking-wider">Spécifications extraites</span>
          <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
            {(specsRow?.[specsColumns[0]] as { name: string; value: string }[])?.map((s, i) => (
              <div key={i} className="flex items-baseline gap-2 py-0.5">
                <span className="text-[11px] text-white/40 shrink-0">{s.name}</span>
                <span className="text-[11px] text-white/70 font-medium">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw JSON */}
      {showRaw && (
        <pre className="text-[10px] text-white/40 bg-black/40 rounded-lg p-3 overflow-auto max-h-48 border border-white/[0.06] font-mono">
          {JSON.stringify(result.rows, null, 2)}
        </pre>
      )}
    </div>
  )
}
