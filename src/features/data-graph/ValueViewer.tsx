import { useMemo, useState } from 'react'
import { formatCell, prettyValue, parseMaybeJson, asSheets, asObjectRows } from './formatValue'

const MAX_VIEW_ROWS = 1000

function DataTable({ columns, headers, rows }: { columns: string[]; headers: string[]; rows: Record<string, unknown>[] }) {
  const shown = rows.slice(0, MAX_VIEW_ROWS)
  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead className="sticky top-0 bg-well">
          <tr>{headers.map((h, i) => <th key={columns[i]} className="border-b border-white/10 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-white/40">{h}</th>)}</tr>
        </thead>
        <tbody>
          {shown.map((r, ri) => (
            <tr key={ri} className="hover:bg-white/[0.03]">
              {columns.map((c) => (
                <td key={c} className="max-w-[280px] truncate border-b border-white/5 px-3 py-1.5 font-mono text-white/70">{formatCell(c, r[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > MAX_VIEW_ROWS && (
        <p className="px-3 py-2 text-[10px] text-white/30">{rows.length - MAX_VIEW_ROWS} ligne(s) supplémentaire(s) non affichée(s).</p>
      )}
    </div>
  )
}

/** Affiche une valeur : feuilles BDD `{columns, rows}` → tableau(x) ; tableau d'objets →
 *  table générique ; sinon JSON indenté. Rend les données tabulaires « à plat ». */
export function ValueViewer({ value }: { value: unknown }) {
  const parsed = useMemo(() => parseMaybeJson(value), [value])
  const sheets = useMemo(() => asSheets(parsed), [parsed])
  const objectRows = useMemo(() => (sheets ? null : asObjectRows(parsed)), [parsed, sheets])
  const [activeSheet, setActiveSheet] = useState(0)

  // Feuilles BDD : sélecteur de feuille + table (en-têtes = labels de colonnes).
  if (sheets) {
    const s = sheets[Math.min(activeSheet, sheets.length - 1)]
    const columns = s.columns.map((c) => c.key)
    const headers = s.columns.map((c) => c.label || c.key)
    return (
      <div className="flex h-full flex-col">
        {sheets.length > 1 && (
          <div className="flex shrink-0 flex-wrap gap-1 border-b border-white/10 px-3 py-2">
            {sheets.map((sh, i) => (
              <button key={i} onClick={() => setActiveSheet(i)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${i === activeSheet ? 'bg-indigo-500/20 text-indigo-300' : 'text-white/45 hover:text-white/80'}`}>
                {sh.name || `Feuille ${i + 1}`} <span className="text-white/30">({sh.rows.length})</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex-1 min-h-0"><DataTable columns={columns} headers={headers} rows={s.rows} /></div>
      </div>
    )
  }

  // Tableau d'objets plats → table générique (colonnes = union des clés).
  if (objectRows) {
    const cols: string[] = []
    const seen = new Set<string>()
    objectRows.forEach((r) => Object.keys(r).forEach((k) => { if (!seen.has(k)) { seen.add(k); cols.push(k) } }))
    return <DataTable columns={cols} headers={cols} rows={objectRows} />
  }

  // Sinon : JSON indenté.
  return <pre className="h-full overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-[12px] leading-relaxed text-white/80">{prettyValue(value)}</pre>
}
