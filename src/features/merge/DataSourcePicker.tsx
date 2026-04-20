import { useState, useEffect, useCallback } from 'react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { useExcelImport } from '@/features/excel/useExcelImport'
import { useExcelFirebase } from '@/features/excel/useExcelFirebase'
import { SheetsFilePicker } from './SheetsFilePicker'
import { useDataMerge } from './useDataMerge'
import { Database, Upload, Loader2, FileSpreadsheet, Table2, X } from 'lucide-react'
import { useMergeStore } from '@/stores/merge.store'
import type { DataSourceRef } from '@/stores/merge.store'

interface SavedDataset {
  docId: string
  fileName: string
  totalRows: number
  totalColumns: number
  sheetCount: number
  updatedAt: number
}

export function DataSourcePicker() {
  const user = useAuthStore((s) => s.user)
  const { connectSource } = useDataMerge()
  const savedDataSource = useMergeStore((s) => s.savedDataSource)
  const { importFile } = useExcelImport()
  const { saveToFirebase } = useExcelFirebase()

  const [datasets, setDatasets] = useState<SavedDataset[]>([])
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'choose' | 'list' | 'sheets'>('choose')
  const [importing, setImporting] = useState(false)

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
          sheetCount: data.sheetCount ?? 1,
          updatedAt: data.updatedAt?.toMillis?.() ?? Date.now(),
        }
      })
      list.sort((a, b) => b.updatedAt - a.updatedAt)
      setDatasets(list)
    } catch (err) {
      console.error('[DataSourcePicker] Load error:', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (mode === 'list') loadDatasets()
  }, [mode, loadDatasets])

  const handleSelect = async (ds: SavedDataset) => {
    const source: DataSourceRef = {
      excelDocId: ds.docId,
      sheetIndex: 0,
      fileName: ds.fileName,
    }
    await connectSource(source)
  }

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const sheets = await importFile(file)
      if (sheets && sheets.length > 0) {
        const docId = await saveToFirebase(file.name, sheets)
        if (!docId) return
        const source: DataSourceRef = {
          excelDocId: docId,
          sheetIndex: 0,
          fileName: file.name,
        }
        await connectSource(source)
      }
    } finally {
      setImporting(false)
    }
  }

  if (savedDataSource) {
    return (
      <div className="p-3 space-y-2">
        <p className="text-xs text-white/40 text-center mb-2">Source précédente disponible</p>
        <button
          onClick={() => connectSource(savedDataSource)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 text-sm text-indigo-400 transition-colors"
        >
          <Database className="w-4 h-4" />
          Reconnecter {savedDataSource.fileName}
        </button>
        <button
          onClick={() => useMergeStore.getState().setSavedDataSource(null)}
          className="w-full text-xs text-white/30 hover:text-white/50 text-center"
        >
          Choisir une autre source
        </button>
      </div>
    )
  }

  if (mode === 'sheets') {
    return (
      <div>
        <div className="flex items-center justify-between px-3 pt-3 pb-1">
          <span className="text-xs text-white/60 font-medium">Google Sheets</span>
          <button onClick={() => setMode('choose')} className="text-white/40 hover:text-white/70">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <SheetsFilePicker onClose={() => setMode('choose')} />
      </div>
    )
  }

  if (mode === 'choose') {
    return (
      <div className="p-3 space-y-2">
        <p className="text-xs text-white/40 text-center mb-3">Aucune source de données</p>
        <button
          onClick={() => setMode('list')}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-white/5 hover:bg-white/10 text-sm text-white/70 transition-colors"
        >
          <Database className="w-4 h-4 text-indigo-400" />
          Choisir un dataset existant
        </button>
        <label className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-white/5 hover:bg-white/10 text-sm text-white/70 transition-colors cursor-pointer">
          <Upload className="w-4 h-4 text-indigo-400" />
          {importing ? 'Import en cours...' : 'Importer un fichier Excel/CSV'}
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileImport}
            className="hidden"
            disabled={importing}
          />
        </label>
        <button
          onClick={() => setMode('sheets')}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-white/5 hover:bg-white/10 text-sm text-white/70 transition-colors"
        >
          <Table2 className="w-4 h-4 text-green-400" />
          Importer depuis Google Sheets
        </button>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-white/60 font-medium">Datasets disponibles</span>
        <button onClick={() => setMode('choose')} className="text-xs text-white/40 hover:text-white/70">
          Retour
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
        </div>
      ) : datasets.length === 0 ? (
        <p className="text-xs text-white/30 text-center py-4">Aucun dataset trouvé</p>
      ) : (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {datasets.map((ds) => (
            <button
              key={ds.docId}
              onClick={() => handleSelect(ds)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-white/5 hover:bg-indigo-500/20 text-left transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 text-green-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white/80 truncate">{ds.fileName}</div>
                <div className="text-xs text-white/30">{ds.totalRows} lignes · {ds.totalColumns} colonnes</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
