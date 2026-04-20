import { useEffect, useRef, useState, useCallback } from 'react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { ChevronDown, Check, FileSpreadsheet, Loader2 } from 'lucide-react'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { useDataMerge } from './useDataMerge'
import type { DataSourceRef } from '@/stores/merge.store'

interface SavedDataset {
  docId: string
  fileName: string
  totalRows: number
  totalColumns: number
  updatedAt: number
}

/**
 * Bouton + dropdown qui remplace l'affichage statique du nom de source dans
 * le DataMergePanel. Permet de switcher vers un autre dataset Firebase sans
 * devoir passer par le DataSourcePicker (déconnect → reconnect).
 */
export function SourceSwitcher() {
  const user = useAuthStore((s) => s.user)
  const { dataSource, connectSource } = useDataMerge()
  const [open, setOpen] = useState(false)
  const [datasets, setDatasets] = useState<SavedDataset[]>([])
  const [loading, setLoading] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const loadDatasets = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const q = query(collection(db, 'excel_data'), where('userId', '==', user.uid))
      const snap = await getDocs(q)
      const list = snap.docs.map((d) => {
        const data = d.data()
        return {
          docId: d.id,
          fileName: data.fileName ?? d.id,
          totalRows: data.totalRows ?? 0,
          totalColumns: data.totalColumns ?? 0,
          updatedAt: data.updatedAt?.toMillis?.() ?? Date.now(),
        }
      })
      list.sort((a, b) => b.updatedAt - a.updatedAt)
      setDatasets(list)
    } catch (err) {
      console.error('[SourceSwitcher] Load error:', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  // Charge les datasets à l'ouverture du dropdown
  useEffect(() => {
    if (open) void loadDatasets()
  }, [open, loadDatasets])

  // Ferme au clic extérieur
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const handleSelect = async (ds: SavedDataset) => {
    if (ds.docId === dataSource?.excelDocId) { setOpen(false); return }
    setSwitching(ds.docId)
    try {
      const next: DataSourceRef = {
        excelDocId: ds.docId,
        sheetIndex: 0,
        fileName: ds.fileName,
      }
      await connectSource(next)
      setOpen(false)
    } catch (err) {
      console.error('[SourceSwitcher] Switch error:', err)
    } finally {
      setSwitching(null)
    }
  }

  return (
    <div ref={rootRef} className="relative flex-1 min-w-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 text-left truncate hover:bg-white/[0.04] rounded px-1 -mx-1 py-0.5 transition-colors"
        title="Changer de source de données"
      >
        <span className="text-indigo-400 font-medium truncate">
          {dataSource?.fileName ?? 'Source'}
        </span>
        <ChevronDown className={`w-3 h-3 text-white/40 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl z-40 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-white/[0.06]">
            <span className="text-[9px] font-semibold text-white/40 uppercase tracking-wider">
              Sources de données
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {loading && datasets.length === 0 ? (
              <div className="flex items-center justify-center py-6 gap-2 text-white/40 text-[11px]">
                <Loader2 className="w-3 h-3 animate-spin" />
                Chargement…
              </div>
            ) : datasets.length === 0 ? (
              <p className="text-[11px] text-white/30 italic py-4 text-center px-3">
                Aucun dataset Firebase trouvé.
              </p>
            ) : (
              datasets.map((ds) => {
                const isCurrent = ds.docId === dataSource?.excelDocId
                const isLoading = switching === ds.docId
                return (
                  <button
                    key={ds.docId}
                    onClick={() => handleSelect(ds)}
                    disabled={isLoading}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                      isCurrent
                        ? 'bg-indigo-500/10 text-indigo-200'
                        : 'text-white/70 hover:bg-white/[0.05]'
                    } disabled:opacity-60`}
                  >
                    <FileSpreadsheet className={`w-3.5 h-3.5 shrink-0 ${isCurrent ? 'text-indigo-300' : 'text-emerald-400/70'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] truncate">{ds.fileName}</div>
                      <div className="text-[10px] text-white/30 truncate">
                        {ds.totalRows} ligne{ds.totalRows > 1 ? 's' : ''} · {ds.totalColumns} colonne{ds.totalColumns > 1 ? 's' : ''}
                      </div>
                    </div>
                    {isLoading ? (
                      <Loader2 className="w-3.5 h-3.5 text-indigo-300 animate-spin shrink-0" />
                    ) : isCurrent ? (
                      <Check className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
                    ) : null}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
