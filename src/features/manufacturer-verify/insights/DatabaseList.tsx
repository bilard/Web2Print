import { useEffect, useMemo, useRef, useState } from 'react'
import { Database, Check, Loader2, Factory, Search, X } from 'lucide-react'
import { useExcelStore } from '@/stores/excel.store'
import { useExcelFirebase } from '@/features/excel/useExcelFirebase'
import { aggregateInsights } from './insightsAggregate'
import { fetchSheetsQuiet } from './fetchSheetsQuiet'

interface DbFile { fileName: string; docId: string; totalRows: number; path: string[] }

/** Minuscule + sans accents, pour une recherche tolérante. */
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Liste des bases PIM (panneau gauche de l'écran d'écarts) : sélection au clic
 *  (charge la base dans le store → l'agrégation réagit à `sheets`), avec un badge
 *  « data fabricant » = nb de produits vérifiés par base. */
export function DatabaseList() {
  const { loadFromFirebase, listSavedFiles } = useExcelFirebase()
  const currentDocId = useExcelStore((s) => s.currentDocId)
  const setCurrentDocId = useExcelStore((s) => s.setCurrentDocId)
  const setCurrentFileName = useExcelStore((s) => s.setCurrentFileName)
  const setCurrentPath = useExcelStore((s) => s.setCurrentPath)
  const setSheetRowId = useExcelStore((s) => s.setSheetRowId)

  const [files, setFiles] = useState<DbFile[]>([])
  const [query, setQuery] = useState('')
  const [loadingId, setLoadingId] = useState<string | null>(null)
  /** Nb de produits vérifiés fabricant par base (undefined = pas encore scanné). */
  const [mfrCounts, setMfrCounts] = useState<Record<string, number>>({})
  const scannedRef = useRef(false)

  const visible = useMemo(() => {
    const q = norm(query.trim())
    if (!q) return files
    return files.filter((f) => norm(f.fileName).includes(q) || f.path.some((p) => norm(p).includes(q)))
  }, [files, query])

  useEffect(() => {
    listSavedFiles()
      .then((list) => setFiles([...list].sort((a, b) => a.fileName.localeCompare(b.fileName, 'fr', { sensitivity: 'base' }))))
      .catch(() => {})
  }, [])

  // Scan en arrière-plan (pool de 4, sans toucher au store) pour compter les
  // produits vérifiés fabricant → badge. Base active comptée depuis le store.
  useEffect(() => {
    if (scannedRef.current || files.length === 0) return
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
  }, [files])

  const select = async (f: DbFile) => {
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

  return (
    <div className="w-60 shrink-0 bg-surface-2 border-r border-white/[0.06] flex flex-col overflow-hidden">
      <div className="px-3 py-3 flex items-center gap-2 border-b border-white/[0.06] shrink-0">
        <Database className="w-4 h-4 text-indigo-300" />
        <span className="text-sm font-semibold">Bases de données</span>
      </div>
      <div className="p-2 border-b border-white/[0.06] shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une base…"
            className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-well border border-white/10 text-sm placeholder:text-white/30 focus:outline-none focus:border-indigo-500/40"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
              aria-label="Effacer la recherche"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 p-1.5 overflow-y-auto flex flex-col gap-0.5">
        {files.length === 0 ? (
          <div className="px-3 py-4 text-sm text-white/40">Aucune base enregistrée</div>
        ) : visible.length === 0 ? (
          <div className="px-3 py-4 text-sm text-white/40">Aucun résultat pour « {query} »</div>
        ) : (
          visible.map((f) => {
            const active = f.docId === currentDocId
            const count = mfrCounts[f.docId]
            return (
              <button
                key={f.docId}
                onClick={() => select(f)}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors ${
                  active ? 'bg-indigo-500/[0.12] border border-indigo-500/25' : 'border border-transparent hover:bg-white/[0.04]'
                }`}
              >
                {loadingId === f.docId
                  ? <Loader2 className="w-4 h-4 shrink-0 animate-spin text-indigo-300" />
                  : <Check className={`w-4 h-4 shrink-0 ${active ? 'text-indigo-400' : 'text-transparent'}`} />}
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-medium truncate ${active ? 'text-white' : 'text-white/85'}`}>{f.fileName}</div>
                  {f.path.length > 0 && <div className="text-xs text-white/40 truncate">{f.path.join(' › ')}</div>}
                </div>
                {count > 0 && (
                  <span
                    title={`${count} produit(s) vérifié(s) chez le fabricant`}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 text-[11px] font-medium shrink-0"
                  >
                    <Factory className="w-3 h-3" />
                    {count}
                  </span>
                )}
                <span className="text-xs text-white/30 tabular-nums shrink-0 w-6 text-right">{f.totalRows}</span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
