import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Database, Check, Loader2, Factory } from 'lucide-react'
import { useExcelStore } from '@/stores/excel.store'
import { useExcelFirebase } from '@/features/excel/useExcelFirebase'
import { aggregateInsights } from './insightsAggregate'
import { fetchSheetsQuiet } from './fetchSheetsQuiet'

interface DbFile { fileName: string; docId: string; totalRows: number; path: string[] }

/** Sélecteur de base PIM pour l'écran d'écarts : charge la base choisie dans le
 *  store (via `loadFromFirebase`), l'agrégation réagit ensuite à `sheets`. */
export function DatabaseSelect() {
  const { loadFromFirebase, listSavedFiles } = useExcelFirebase()
  const currentDocId = useExcelStore((s) => s.currentDocId)
  const currentFileName = useExcelStore((s) => s.currentFileName)
  const setCurrentDocId = useExcelStore((s) => s.setCurrentDocId)
  const setCurrentFileName = useExcelStore((s) => s.setCurrentFileName)
  const setCurrentPath = useExcelStore((s) => s.setCurrentPath)
  const setSheetRowId = useExcelStore((s) => s.setSheetRowId)

  const [files, setFiles] = useState<DbFile[]>([])
  const [open, setOpen] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  /** Nb de produits vérifiés fabricant par base (undefined = pas encore scanné). */
  const [mfrCounts, setMfrCounts] = useState<Record<string, number>>({})
  const scannedRef = useRef(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { listSavedFiles().then(setFiles).catch(() => {}) }, [])

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  // Au 1er ouvrir : scanne chaque base (en arrière-plan, sans toucher au store) pour
  // compter ses produits vérifiés fabricant → badge. La base active est comptée
  // depuis le store (pas de lecture réseau). Pool de 4 pour ne pas saturer.
  useEffect(() => {
    if (!open || scannedRef.current || files.length === 0) return
    scannedRef.current = true
    let cancelled = false
    const queue = [...files]
    const worker = async () => {
      while (queue.length) {
        const f = queue.shift()
        if (!f) break
        const { sheets, currentDocId: activeId } = useExcelStore.getState()
        const s = f.docId === activeId ? sheets : await fetchSheetsQuiet(f.docId)
        const n = s ? aggregateInsights(s).verifiedCount : 0
        if (cancelled) return
        setMfrCounts((m) => ({ ...m, [f.docId]: n }))
      }
    }
    void Promise.all(Array.from({ length: 4 }, worker))
    return () => { cancelled = true }
  }, [open, files])

  const select = async (f: DbFile) => {
    setOpen(false)
    if (f.docId === currentDocId) return
    setLoadingId(f.docId)
    try {
      const loaded = await loadFromFirebase(f.docId)
      if (loaded) {
        setCurrentDocId(f.docId)
        setCurrentFileName(f.fileName)
        setCurrentPath(f.path ?? [])
        setSheetRowId(null)
      }
    } finally { setLoadingId(null) }
  }

  const label = currentFileName ?? 'Base active'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-white/10 hover:border-white/20 text-sm transition-colors"
      >
        {loadingId ? <Loader2 className="w-4 h-4 animate-spin text-indigo-300" /> : <Database className="w-4 h-4 text-indigo-300" />}
        <span className="font-medium max-w-[14rem] truncate">{label}</span>
        <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-72 max-h-80 overflow-y-auto rounded-lg border border-white/10 bg-surface-2 shadow-xl p-1">
          {files.length === 0 ? (
            <div className="px-3 py-2 text-sm text-white/40">Aucune base enregistrée</div>
          ) : (
            files.map((f) => (
              <button
                key={f.docId}
                onClick={() => select(f)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left hover:bg-white/[0.05] transition-colors"
              >
                <Check className={`w-4 h-4 shrink-0 ${f.docId === currentDocId ? 'text-indigo-400' : 'text-transparent'}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{f.fileName}</div>
                  {f.path.length > 0 && <div className="text-xs text-white/40 truncate">{f.path.join(' › ')}</div>}
                </div>
                {mfrCounts[f.docId] > 0 && (
                  <span
                    title={`${mfrCounts[f.docId]} produit(s) vérifié(s) chez le fabricant`}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 text-[11px] font-medium shrink-0"
                  >
                    <Factory className="w-3 h-3" />
                    {mfrCounts[f.docId]}
                  </span>
                )}
                <span className="text-xs text-white/35 tabular-nums shrink-0 w-6 text-right">{f.totalRows}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
