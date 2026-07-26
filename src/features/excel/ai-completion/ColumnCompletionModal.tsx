import { useMemo, useState } from 'react'
import { Wand2, X } from 'lucide-react'
import { useExcelStore } from '@/stores/excel.store'
import { useColumnCompletion } from './useColumnCompletion'
import type { ExcelRow } from '@/features/excel/types'

interface Props { open: boolean; onClose: () => void; visibleRowIds: string[] }

export function ColumnCompletionModal({ open, onClose, visibleRowIds }: Props) {
  const sheets = useExcelStore((s) => s.sheets)
  const activeSheetIndex = useExcelStore((s) => s.activeSheetIndex)
  const sheet = sheets[activeSheetIndex]
  const { items, running, runPreview, runAll, abort, ensureTargetColumn } = useColumnCompletion()

  const [prompt, setPrompt] = useState('')
  const [destMode, setDestMode] = useState<'new' | 'existing'>('new')
  const [newLabel, setNewLabel] = useState('Résultat IA')
  const [existingKey, setExistingKey] = useState('')
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)
  const [scopeAll, setScopeAll] = useState(true)
  const [previewed, setPreviewed] = useState(false)
  // Garde-fou anti-doublon : clé de la colonne créée pendant CETTE session « nouvelle colonne ».
  // Un 2e clic « Appliquer » réécrit la même colonne au lieu d'en créer une autre (resultat_ia_2…).
  const [appliedNewColKey, setAppliedNewColKey] = useState<string | null>(null)

  const scopedRows: ExcelRow[] = useMemo(() => {
    if (!sheet) return []
    if (scopeAll) return sheet.rows
    const set = new Set(visibleRowIds)
    return sheet.rows.filter((r) => set.has(r._id))
  }, [sheet, scopeAll, visibleRowIds])

  if (!open || !sheet) return null

  const canApply = previewed && prompt.trim().length > 0 && !running &&
    (destMode === 'new' ? newLabel.trim().length > 0 : (existingKey !== '' && confirmOverwrite))

  const handlePreview = async () => {
    await runPreview({ prompt, rows: scopedRows, columns: sheet.columns })
    setPreviewed(true)
  }
  const handleApply = async () => {
    let targetColKey: string
    if (destMode === 'existing') {
      targetColKey = existingKey
    } else if (appliedNewColKey) {
      targetColKey = appliedNewColKey // ré-application : réécrit la colonne déjà créée
    } else {
      targetColKey = ensureTargetColumn({ mode: 'new', label: newLabel.trim() })
      setAppliedNewColKey(targetColKey)
    }
    await runAll({ prompt, rows: scopedRows, columns: sheet.columns, targetColKey, write: true })
  }

  const previewRows = items.slice(0, 5)
  const doneCount = items.filter((i) => i.status === 'done').length

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-surface border border-white/10 rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 text-white/90 font-medium">
            <Wand2 className="w-4 h-4" /> IA complétion
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white/90"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-[13px] text-white/80">
          <div>
            <label className="block mb-1 text-white/60">Consigne (référencez vos colonnes avec [Nom])</label>
            <textarea
              value={prompt} onChange={(e) => { setPrompt(e.target.value); setPreviewed(false) }}
              rows={3} placeholder="Ex : Génère un nom de produit court à partir de [Description]"
              className="w-full bg-well border border-white/10 rounded p-2 text-white/90"
            />
            <div className="mt-1 flex flex-wrap gap-1">
              {sheet.columns.map((c) => (
                <button key={c.key} onClick={() => { setPrompt((p) => `${p}[${c.label}]`); setPreviewed(false) }}
                  className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-white/60 text-[12px]">
                  [{c.label}]
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-white/60">Destination</div>
            <label className="flex items-center gap-2">
              <input type="radio" checked={destMode === 'new'} onChange={() => { setDestMode('new'); setAppliedNewColKey(null) }} />
              Nouvelle colonne
              {destMode === 'new' && (
                <input value={newLabel} onChange={(e) => { setNewLabel(e.target.value); setAppliedNewColKey(null) }}
                  className="ml-2 bg-well border border-white/10 rounded px-2 py-0.5 text-white/90" />
              )}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={destMode === 'existing'} onChange={() => setDestMode('existing')} />
              Colonne existante
              {destMode === 'existing' && (
                <select value={existingKey} onChange={(e) => setExistingKey(e.target.value)}
                  className="ml-2 bg-well border border-white/10 rounded px-2 py-0.5 text-white/90">
                  <option value="">— choisir —</option>
                  {sheet.columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              )}
            </label>
            {destMode === 'existing' && existingKey && (
              <label className="flex items-center gap-2 text-amber-400/90">
                <input type="checkbox" checked={confirmOverwrite} onChange={(e) => setConfirmOverwrite(e.target.checked)} />
                J'écrase les valeurs existantes de cette colonne
              </label>
            )}
          </div>

          <div className="space-y-1">
            <div className="text-white/60">Portée</div>
            <label className="flex items-center gap-2">
              <input type="radio" checked={scopeAll} onChange={() => setScopeAll(true)} />
              Toutes les lignes ({sheet.rows.length})
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={!scopeAll} onChange={() => setScopeAll(false)} />
              Lignes filtrées ({visibleRowIds.length})
            </label>
          </div>

          {previewed && (
            <div className="border border-white/10 rounded">
              <div className="px-2 py-1 text-white/60 border-b border-white/10">Aperçu</div>
              <table className="w-full text-[12px]">
                <tbody>
                  {previewRows.map((it) => (
                    <tr key={it.rowId} className="border-b border-white/5">
                      <td className="px-2 py-1 text-white/50">{it.status}</td>
                      <td className="px-2 py-1 text-white/90">{it.value ?? it.error ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
          <div className="text-[12px] text-white/50">
            {running ? `En cours… ${doneCount}/${scopedRows.length}` : ''}
          </div>
          <div className="flex items-center gap-2">
            {running ? (
              <button onClick={abort} className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-white/80">Annuler</button>
            ) : (
              <>
                <button onClick={handlePreview} disabled={!prompt.trim() || running}
                  className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-white/80 disabled:opacity-40">
                  Aperçu (5 lignes)
                </button>
                <button onClick={handleApply} disabled={!canApply}
                  className="px-3 py-1.5 rounded bg-accent text-[#fff] disabled:opacity-40">
                  Appliquer à tout
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
