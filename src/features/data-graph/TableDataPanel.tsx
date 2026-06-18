// src/features/data-graph/TableDataPanel.tsx
import { useMemo, useState } from 'react'
import { Search, X, Loader2, Braces, Copy, Check } from 'lucide-react'
import type { TableSchema } from './firestoreSchema'
import { useTableData, type TableRow } from './useTableData'
import { formatCell, prettyValue } from './formatValue'
import { ValueViewer } from './ValueViewer'

/** Colonnes = champs du schéma (ordre) + clé doc `id` + clés extra présentes.
 *  En mode aplati (flattenSheets) : colonnes dérivées UNIQUEMENT des lignes produit. */
function useColumns(table: TableSchema, rows: TableRow[]): string[] {
  return useMemo(() => {
    const cols: string[] = []
    const seen = new Set<string>()
    const push = (k: string) => { if (!seen.has(k) && k !== '_docId') { seen.add(k); cols.push(k) } }
    if (table.query?.flattenSheets) {
      push('bdd')
      push('feuille')
      rows.forEach((r) => Object.keys(r).forEach(push))
      return cols
    }
    table.fields.forEach((f) => push(f.name))
    if (!seen.has('id')) push('id')
    rows.forEach((r) => Object.keys(r).forEach(push))
    return cols
  }, [table, rows])
}

/** Panneau bas : données LIVE de la table sélectionnée (filtre, compteur, fermer). */
export function TableDataPanel({ table, onClose }: { table: TableSchema; onClose: () => void }) {
  const { rows, loading, error, live } = useTableData(table.query ?? null)
  const columns = useColumns(table, rows)
  const [filter, setFilter] = useState('')
  const [detail, setDetail] = useState<{ col: string; value: unknown } | null>(null)
  const [copied, setCopied] = useState(false)
  // Champ PK : souvent l'id du document (non stocké comme champ, ex. users.uid) → repli sur _docId.
  const pkField = table.fields.find((f) => f.pk)?.name

  const copyDetail = async () => {
    if (!detail) return
    try { await navigator.clipboard.writeText(prettyValue(detail.value)); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard indispo */ }
  }

  const cellValue = (r: TableRow, c: string): unknown => {
    if (c === 'id') return r._docId
    if (c === pkField && r[c] == null) return r._docId
    return r[c]
  }

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => columns.some((c) => formatCell(c, cellValue(r, c)).toLowerCase().includes(q)))
  }, [rows, columns, filter])

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 flex h-[46%] min-h-[220px] flex-col border-t-2 border-indigo-500/60 bg-well shadow-[0_-12px_30px_rgba(0,0,0,0.4)]">
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-2.5">
        <span className="rounded-md bg-indigo-500 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-[#fff]">TABLE</span>
        <span className="font-mono text-[13px] font-semibold text-white">{table.label}</span>
        <span className="text-[11px] text-white/40">({filtered.length} enregistrement{filtered.length > 1 ? 's' : ''})</span>
        {!error && (live ? (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> LIVE
          </span>
        ) : (
          <span className="text-[10px] font-semibold text-white/35">INSTANTANÉ</span>
        ))}
        <div className="relative ml-auto w-72 max-w-[40%]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrer les résultats…"
            className="w-full rounded-lg border border-white/10 bg-surface py-1.5 pl-8 pr-3 text-[12px] text-white placeholder:text-white/30 focus:border-indigo-400/50 focus:outline-none"
          />
        </div>
        <button onClick={onClose} className="flex shrink-0 items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[12px] text-white/60 transition-colors hover:text-white">
          Fermer <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-[12px] text-white/40"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-[12px] text-amber-400/80">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[12px] text-white/30">Aucun enregistrement.</div>
        ) : (
          <table className="w-full border-collapse text-[12px]">
            <thead className="sticky top-0 bg-well">
              <tr>{columns.map((c) => <th key={c} className="border-b border-white/10 px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-white/40">{c}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r._docId} className="hover:bg-white/[0.03]">
                  {columns.map((c) => (
                    <td
                      key={c}
                      onDoubleClick={() => setDetail({ col: c, value: cellValue(r, c) })}
                      title="Double-clic pour voir la valeur complète"
                      className="max-w-[260px] cursor-zoom-in truncate border-b border-white/5 px-4 py-2 font-mono text-white/70 hover:text-white"
                    >
                      {formatCell(c, cellValue(r, c))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Visionneuse de valeur (double-clic sur une cellule) */}
      {detail && (
        <div className="absolute inset-0 z-20 flex flex-col bg-well">
          <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-2.5">
            <Braces className="h-4 w-4 text-indigo-400" />
            <span className="font-mono text-[13px] font-semibold text-white">{detail.col}</span>
            <button onClick={copyDetail} className="ml-auto flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[12px] text-white/60 transition-colors hover:text-white">
              {copied ? <><Check className="h-3.5 w-3.5 text-emerald-400" /> Copié</> : <><Copy className="h-3.5 w-3.5" /> Copier</>}
            </button>
            <button onClick={() => setDetail(null)} className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[12px] text-white/60 transition-colors hover:text-white">
              Fermer <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="min-h-0 flex-1"><ValueViewer value={detail.value} /></div>
        </div>
      )}
    </div>
  )
}
