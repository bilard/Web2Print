import { useState, useMemo, useCallback } from 'react'
import { Search, X, Globe, FileText, Edit2 } from 'lucide-react'
import { useExcelStore } from '@/stores/excel.store'
import { usePimStore } from '@/stores/pim.store'

/** Colonne latérale qui liste les sheets (= sources scrapées/importées) du fichier
 *  courant. Click → setActiveSheet (filtre la table). Recherche pour scaler à des
 *  centaines de sources. Remplace les onglets horizontaux. */
export function SheetsColumn() {
  const sheets = useExcelStore((s) => s.sheets)
  const activeSheetIndex = useExcelStore((s) => s.activeSheetIndex)
  const setActiveSheet = useExcelStore((s) => s.setActiveSheet)
  const deleteSheet = useExcelStore((s) => s.deleteSheet)
  const renameSheet = useExcelStore((s) => s.renameSheet)
  const selectedSourceIds = usePimStore((s) => s.selectedSourceIds)
  const setSelectedSourceIds = usePimStore((s) => s.setSelectedSourceIds)
  const [filter, setFilter] = useState('')
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null)
  const [renamingValue, setRenamingValue] = useState('')

  /** Click sur une source = toggle d'affichage de SES produits dans la table.
   *  - Source non sélectionnée → on l'active (DataTable lit `activeSheetIndex`)
   *    et on l'ajoute à `selectedSourceIds` pour le surlignage.
   *  - Source déjà sélectionnée → on la retire de la sélection ; si elle était
   *    aussi la sheet active, on bascule sur la première sheet restant
   *    sélectionnée (ou sur la première sheet tout court si plus rien) afin
   *    que la table ne reste pas figée sur une source qu'on vient de masquer. */
  const handleToggleSelection = useCallback((sheetName: string, index: number) => {
    const isSelected = selectedSourceIds.includes(sheetName)
    if (!isSelected) {
      setActiveSheet(index)
      setSelectedSourceIds([...selectedSourceIds, sheetName])
      return
    }
    const remaining = selectedSourceIds.filter((id) => id !== sheetName)
    setSelectedSourceIds(remaining)
    if (sheets[activeSheetIndex]?.name === sheetName) {
      // Bascule sur le premier restant sélectionné, sinon première sheet du fichier.
      const fallback = remaining.length > 0
        ? sheets.findIndex((s) => s.name === remaining[0])
        : 0
      if (fallback >= 0) setActiveSheet(fallback)
    }
  }, [selectedSourceIds, setSelectedSourceIds, setActiveSheet, sheets, activeSheetIndex])

  const filtered = useMemo(() => {
    const all = sheets.map((s, i) => ({ sheet: s, index: i }))
    if (!filter) return all
    const q = filter.toLowerCase()
    return all.filter(({ sheet }) => sheet.name.toLowerCase().includes(q))
  }, [sheets, filter])

  return (
    <aside className="w-[200px] shrink-0 border-r border-white/[0.06] bg-[#0f0f0f] flex flex-col">
      <div className="p-2 border-b border-white/[0.06]">
        <p className="text-[10px] uppercase tracking-wider text-white/30 px-1 mb-1.5">
          Sources <span className="text-white/20">· {sheets.length}</span>
        </p>
        <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.06] rounded-md px-2 py-1">
          <Search className="w-3 h-3 text-white/30" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrer…"
            className="bg-transparent text-[11px] text-white/70 placeholder:text-white/25 outline-none flex-1 min-w-0"
          />
          {filter && (
            <span
              role="button"
              tabIndex={0}
              onClick={() => setFilter('')}
              onKeyDown={(e) => { if (e.key === 'Enter') setFilter('') }}
              className="text-white/30 hover:text-white/60 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </span>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {filtered.map(({ sheet, index }) => {
          const isHost = /\.[a-z]{2,}/i.test(sheet.name)
          const Icon = isHost ? Globe : FileText
          const active = index === activeSheetIndex
          const isRenaming = renamingIndex === index
          const isSelected = selectedSourceIds.includes(sheet.name)
          const handleSelect = () => {
            handleToggleSelection(sheet.name, index)
          }
          const handleRenameStart = (e: React.MouseEvent) => {
            e.stopPropagation()
            setRenamingIndex(index)
            setRenamingValue(sheet.name)
          }
          const handleRenameSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
            e.stopPropagation()
            if (e.key === 'Enter') {
              if (renamingValue.trim()) {
                renameSheet(index, renamingValue.trim())
                setSelectedSourceIds([renamingValue.trim()])
              }
              setRenamingIndex(null)
            } else if (e.key === 'Escape') {
              setRenamingIndex(null)
            }
          }
          const handleRenameBlur = () => {
            if (renamingValue.trim()) {
              renameSheet(index, renamingValue.trim())
              setSelectedSourceIds([renamingValue.trim()])
            }
            setRenamingIndex(null)
          }

          if (isRenaming) {
            return (
              <div key={index} className="flex items-center gap-2 px-2 py-1.5 bg-indigo-500/20 border-l-2 border-indigo-500">
                <Icon className="w-3.5 h-3.5 shrink-0 opacity-60" />
                <input
                  autoFocus
                  value={renamingValue}
                  onChange={(e) => setRenamingValue(e.target.value)}
                  onKeyDown={handleRenameSubmit}
                  onBlur={handleRenameBlur}
                  className="flex-1 bg-transparent text-[12px] text-indigo-200 outline-none"
                />
              </div>
            )
          }

          return (
            <div
              key={index}
              role="button"
              tabIndex={0}
              onClick={handleSelect}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelect() }}
              className={`group flex items-center gap-2 px-2 py-1.5 text-[12px] cursor-pointer transition-colors border-l-2 ${
                isSelected
                  ? 'bg-indigo-500/15 text-indigo-200 border-indigo-500'
                  : 'text-white/60 hover:bg-white/[0.04] hover:text-white/85 border-transparent'
              }`}
              title={sheet.name}
            >
              <Icon className="w-3.5 h-3.5 shrink-0 opacity-60" />
              <span className="flex-1 truncate">{sheet.name}</span>
              <span className="text-[10px] tabular-nums text-white/30">{sheet.rows.length}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={handleRenameStart}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') handleRenameStart(e as any) }}
                className="hover:bg-white/10 rounded p-0.5 text-white/40 hover:text-amber-300 cursor-pointer transition-colors"
                title={`Renommer « ${sheet.name} »`}
              >
                <Edit2 className="w-3 h-3" />
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm(`Supprimer « ${sheet.name} » ?`)) deleteSheet(index)
                }}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') {
                    if (confirm(`Supprimer « ${sheet.name} » ?`)) deleteSheet(index)
                  }
                }}
                className="hover:bg-white/10 rounded p-0.5 text-white/40 hover:text-red-300 cursor-pointer transition-colors"
                title={`Supprimer « ${sheet.name} »`}
              >
                <X className="w-3 h-3" />
              </span>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <p className="text-[11px] text-white/30 px-3 py-2">Aucune source.</p>
        )}
      </div>
    </aside>
  )
}
