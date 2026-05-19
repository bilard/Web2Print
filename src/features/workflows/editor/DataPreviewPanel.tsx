// src/features/workflows/editor/DataPreviewPanel.tsx
import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '@xyflow/react'
import {
  Table2,
  FileImage,
  FileText,
  Download,
  Eye,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  AlertTriangle,
} from 'lucide-react'
import { useRunContext } from '../runtime/runContext'
import { useWorkflowStore } from '../persistence/workflow.store'
import { nodeRegistry } from '../registry'
import { getFile, getFiles } from '../runtime/fileStore'
import { parseExcelFile } from '@/features/excel/useExcelImport'
import { usePreviewFocus } from './previewFocus.store'
import { PanelResizeHandle, usePanelResize } from './usePanelResize'
import type { NodeRunState, NodeStatus, Workflow } from '../types'

const UPLOAD_TABLE_RE = /\.(csv|xlsx|xls|tsv)$/i

interface UploadConfigLike {
  fileKey?: string
  fileName?: string
  mode?: 'file' | 'folder'
}

interface SheetLike {
  name?: string
  columns?: { key: string; label?: string }[]
  rows?: Record<string, unknown>[]
}

interface AssetLike {
  url?: string
  src?: string
  name?: string
  type?: string
  mimeType?: string
}

interface ExportLike {
  url: string
  filename: string
  mime?: string
}

const PREVIEW_PORT_PRIORITY = ['sheet', 'products', 'result', 'assets', 'file']
const MAX_ASSETS = 16
const PAGE_SIZE_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 10, label: '10' },
  { value: 25, label: '25' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: -1, label: 'Tout' },
]
const DEFAULT_PAGE_SIZE = 10
const AUTOCOMPLETE_MAX_OPTIONS = 500
const AUTOCOMPLETE_MIN_LEN = 1
const AUTOCOMPLETE_MAX_LEN = 80
const AUTOCOMPLETE_DROPDOWN_LIMIT = 50

/**
 * Découpe un texte selon les occurrences (case-insensitive) du `query` et
 * enveloppe chaque match dans un <mark> stylé. Renvoie un fragment React
 * prêt à être posé dans une <option>/<li>.
 */
function highlightMatch(text: string, query: string): ReactNode {
  const q = query.trim()
  if (!q) return text
  const lowerText = text.toLowerCase()
  const lowerQuery = q.toLowerCase()
  const parts: ReactNode[] = []
  let lastIdx = 0
  let idx = lowerText.indexOf(lowerQuery)
  let key = 0
  while (idx >= 0) {
    if (idx > lastIdx) {
      parts.push(<Fragment key={key++}>{text.slice(lastIdx, idx)}</Fragment>)
    }
    parts.push(
      <mark
        key={key++}
        className="bg-indigo-500/30 text-indigo-100 rounded-sm px-0.5"
      >
        {text.slice(idx, idx + q.length)}
      </mark>,
    )
    lastIdx = idx + q.length
    idx = lowerText.indexOf(lowerQuery, lastIdx)
  }
  if (lastIdx < text.length) {
    parts.push(<Fragment key={key++}>{text.slice(lastIdx)}</Fragment>)
  }
  return parts
}

function isSheet(v: unknown): v is SheetLike {
  return (
    typeof v === 'object' &&
    v !== null &&
    Array.isArray((v as SheetLike).columns) &&
    Array.isArray((v as SheetLike).rows)
  )
}

function isAssetArray(v: unknown): v is AssetLike[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    typeof v[0] === 'object' &&
    v[0] !== null &&
    ('url' in (v[0] as object) || 'src' in (v[0] as object))
  )
}

function isExportResult(v: unknown): v is ExportLike {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as ExportLike).url === 'string' &&
    typeof (v as ExportLike).filename === 'string'
  )
}

interface PreviewTarget {
  nodeId: string
  nodeLabel: string
  portName: string
  value: unknown
  status: NodeStatus
  errorReason?: string
}

function pickPrimaryOutput(outputs: Record<string, unknown>): { name: string; value: unknown } | null {
  const entries = Object.entries(outputs).filter(([, v]) => v !== null && v !== undefined)
  if (entries.length === 0) return null
  for (const key of PREVIEW_PORT_PRIORITY) {
    const hit = entries.find(([n]) => n === key)
    if (hit) return { name: hit[0], value: hit[1] }
  }
  // Fallback: first non-empty
  return { name: entries[0][0], value: entries[0][1] }
}

function pickLatestPreview(
  states: Record<string, NodeRunState>,
  liveIds: Set<string>,
  nodeLabelFor: (id: string) => string,
): PreviewTarget | null {
  // Priority: a currently running node with partial outputs (live), otherwise
  // the most recently ended successful node. Both keep the preview "live"
  // — running nodes show whatever they've published, and the panel re-renders
  // automatically as Zustand state updates.
  let running: { state: NodeRunState; id: string; startedAt: number } | null = null
  let success: { state: NodeRunState; id: string; endedAt: number } | null = null
  for (const [id, st] of Object.entries(states)) {
    if (!liveIds.has(id)) continue
    if (st.status === 'running' && st.outputs) {
      const startedAt = st.startedAt ?? 0
      if (!running || startedAt > running.startedAt) running = { state: st, id, startedAt }
    } else if (st.status === 'success' && st.outputs) {
      const endedAt = st.endedAt ?? 0
      if (!success || endedAt > success.endedAt) success = { state: st, id, endedAt }
    }
  }
  const pick = running ?? success
  if (!pick || !pick.state.outputs) return null
  const primary = pickPrimaryOutput(pick.state.outputs)
  if (!primary) return null
  return {
    nodeId: pick.id,
    nodeLabel: nodeLabelFor(pick.id),
    portName: primary.name,
    value: primary.value,
    status: pick.state.status,
  }
}

function useStaticNodePreview(
  wf: Workflow | null,
  selectedId: string | undefined,
  labelFor: (id: string) => string,
): PreviewTarget | null {
  const node = useMemo(
    () => (selectedId ? wf?.nodes.find((n) => n.id === selectedId) ?? null : null),
    [wf, selectedId],
  )
  const isUpload = node?.type === 'upload'
  const cfg = isUpload ? (node!.config as UploadConfigLike) : null
  const fileKey = cfg?.fileKey ?? ''
  const fileName = cfg?.fileName ?? ''
  const mode = cfg?.mode ?? 'file'
  const nodeId = node?.id ?? ''

  const [preview, setPreview] = useState<PreviewTarget | null>(null)

  useEffect(() => {
    if (!isUpload || !fileKey || !nodeId) {
      setPreview(null)
      return
    }
    let cancelled = false
    setPreview({
      nodeId,
      nodeLabel: labelFor(nodeId),
      portName: mode === 'folder' ? 'files' : 'sheet',
      status: 'running',
      value: null,
    })
    ;(async () => {
      try {
        if (mode === 'folder') {
          const files = await getFiles(fileKey)
          if (cancelled) return
          if (!files || files.length === 0) {
            setPreview({
              nodeId,
              nodeLabel: labelFor(nodeId),
              portName: 'files',
              status: 'error',
              value: null,
              errorReason: `Dossier "${fileName || '(sans nom)'}" introuvable en stockage local. Recharge-le via la config du node.`,
            })
            return
          }
          const sheet: SheetLike = {
            name: `${fileName} — ${files.length} fichier${files.length > 1 ? 's' : ''}`,
            columns: [
              { key: 'nom', label: 'Nom' },
              { key: 'chemin', label: 'Chemin' },
              { key: 'type', label: 'Type' },
              { key: 'taille', label: 'Taille' },
            ],
            rows: files.map((f) => {
              const ext = f as File & { _path?: string; webkitRelativePath?: string }
              return {
                nom: f.name,
                chemin: ext._path ?? ext.webkitRelativePath ?? f.name,
                type: f.type || '—',
                taille: formatBytes(f.size),
              }
            }),
          }
          setPreview({
            nodeId,
            nodeLabel: labelFor(nodeId),
            portName: 'files',
            status: 'success',
            value: sheet,
          })
          return
        }
        const f = await getFile(fileKey)
        if (cancelled) return
        if (!f) {
          setPreview({
            nodeId,
            nodeLabel: labelFor(nodeId),
            portName: 'sheet',
            status: 'error',
            value: null,
            errorReason: `Fichier "${fileName || '(sans nom)'}" introuvable en stockage local. Recharge-le via la config du node (bouton "Remplacer par un fichier").`,
          })
          return
        }
        if (UPLOAD_TABLE_RE.test(f.name)) {
          const sheets = await parseExcelFile(f)
          if (cancelled) return
          if (sheets.length === 0) {
            setPreview(null)
            return
          }
          setPreview({
            nodeId,
            nodeLabel: labelFor(nodeId),
            portName: 'sheet',
            status: 'success',
            value: sheets[0],
          })
          return
        }
        setPreview({
          nodeId,
          nodeLabel: labelFor(nodeId),
          portName: 'file',
          status: 'success',
          value: { nom: f.name, type: f.type || '—', taille: formatBytes(f.size) },
        })
      } catch (err) {
        if (!cancelled) {
          console.warn('[DataPreviewPanel] Static preview failed', err)
          setPreview(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUpload, fileKey, mode, nodeId])

  return preview
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function SheetPreview({ sheet }: { sheet: SheetLike }) {
  const cols = sheet.columns ?? []
  const allRows = sheet.rows ?? []
  const totalRows = allRows.length
  const totalCols = cols.length

  const focusedColumn = usePreviewFocus((s) => s.columnLabel)
  const focusPulse = usePreviewFocus((s) => s.pulse)
  const headerRefs = useRef<Map<string, HTMLTableCellElement | null>>(new Map())
  const listboxId = useId()

  const [query, setQuery] = useState('')
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)
  const [page, setPage] = useState(0)
  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  const searchWrapRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const dropdownRef = useRef<HTMLUListElement | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  const [dropdownRect, setDropdownRect] = useState<{ left: number; top: number; width: number } | null>(null)

  // Reset pagination quand le contexte (sheet, query, taille) change.
  useEffect(() => {
    setPage(0)
  }, [query, pageSize, sheet])

  const focusedKey = useMemo(() => {
    if (!focusedColumn) return null
    const match = cols.find((c) => (c.label ?? c.key) === focusedColumn)
    return match?.key ?? null
  }, [cols, focusedColumn])

  useEffect(() => {
    if (!focusedKey) return
    const el = headerRefs.current.get(focusedKey)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [focusedKey, focusPulse])

  // Index normalisé pour recherche / autocomplétion : on précalcule les
  // chaînes lowercased par ligne (lookup en O(1)) + un Set de valeurs
  // uniques pour la datalist.
  const { rowIndex, autocompleteValues } = useMemo(() => {
    const idx: string[] = new Array(allRows.length)
    const unique = new Set<string>()
    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i]
      const parts: string[] = []
      for (const c of cols) {
        const raw = row?.[c.key]
        const cell = formatCell(raw)
        if (cell) {
          parts.push(cell)
          if (
            cell.length >= AUTOCOMPLETE_MIN_LEN &&
            cell.length <= AUTOCOMPLETE_MAX_LEN
          ) {
            unique.add(cell)
          }
        }
      }
      idx[i] = parts.join('  ').toLowerCase()
      if (unique.size >= AUTOCOMPLETE_MAX_OPTIONS) {
        // Continue à indexer pour la recherche, mais ne grossit plus la datalist.
      }
    }
    const arr = Array.from(unique)
    arr.sort((a, b) => a.localeCompare(b))
    return { rowIndex: idx, autocompleteValues: arr.slice(0, AUTOCOMPLETE_MAX_OPTIONS) }
  }, [allRows, cols])

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allRows
    return allRows.filter((_, i) => rowIndex[i]?.includes(q))
  }, [allRows, query, rowIndex])

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const out: string[] = []
    for (const v of autocompleteValues) {
      if (v.toLowerCase().includes(q)) {
        out.push(v)
        if (out.length >= AUTOCOMPLETE_DROPDOWN_LIMIT) break
      }
    }
    return out
  }, [autocompleteValues, query])

  // Reset l'index actif quand le set de suggestions change.
  useEffect(() => {
    setActiveSuggestion(0)
  }, [suggestions])

  // Fermeture du dropdown sur clic extérieur. Le dropdown est rendu via
  // Portal hors de l'arbre DOM du panel — il faut donc accepter les clics
  // qui tombent dedans via dropdownRef en plus du wrap d'origine.
  useEffect(() => {
    if (!showSuggestions) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null
      if (!t) return
      if (searchWrapRef.current?.contains(t)) return
      if (dropdownRef.current?.contains(t)) return
      setShowSuggestions(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [showSuggestions])

  // Recalcule la position du dropdown (placé en fixed via Portal). Re-couru
  // sur ouverture, resize, scroll capturé et changement du nombre de
  // suggestions (pour ajuster la hauteur affichée).
  useLayoutEffect(() => {
    if (!showSuggestions || suggestions.length === 0) {
      setDropdownRect(null)
      return
    }
    const measure = () => {
      const el = inputRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setDropdownRect({ left: r.left, top: r.top, width: r.width })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [showSuggestions, suggestions.length])

  const filteredCount = filteredRows.length
  const showAll = pageSize === -1
  const effectivePageSize = showAll ? Math.max(filteredCount, 1) : pageSize
  const pageCount = showAll ? 1 : Math.max(1, Math.ceil(filteredCount / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const start = safePage * effectivePageSize
  const end = Math.min(start + effectivePageSize, filteredCount)
  const visibleRows = showAll ? filteredRows : filteredRows.slice(start, end)

  const goToPage = (p: number) => {
    setPage(Math.max(0, Math.min(p, pageCount - 1)))
    tableScrollRef.current?.scrollTo({ top: 0 })
  }

  if (cols.length === 0 || totalRows === 0) {
    return <EmptyState label="Sheet vide" />
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-2">
      {/* Toolbar : caption + recherche + page size */}
      <div className="flex items-center gap-3 text-[11px] text-neutral-500 shrink-0 flex-wrap">
        {sheet.name ? <span className="text-neutral-300">{sheet.name}</span> : null}
        <span>
          {filteredCount.toLocaleString('fr-FR')}
          {query ? ` / ${totalRows.toLocaleString('fr-FR')}` : ''} ligne
          {filteredCount > 1 ? 's' : ''} · {totalCols} colonne{totalCols > 1 ? 's' : ''}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <div ref={searchWrapRef} className="relative">
            <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setShowSuggestions(true)
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={(e) => {
                if (!showSuggestions || suggestions.length === 0) {
                  if (e.key === 'Escape') setShowSuggestions(false)
                  return
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setActiveSuggestion((i) => Math.min(i + 1, suggestions.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setActiveSuggestion((i) => Math.max(i - 1, 0))
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  setQuery(suggestions[activeSuggestion])
                  setShowSuggestions(false)
                } else if (e.key === 'Escape') {
                  setShowSuggestions(false)
                }
              }}
              placeholder="Rechercher dans les données…"
              spellCheck={false}
              autoComplete="off"
              role="combobox"
              aria-expanded={showSuggestions && suggestions.length > 0}
              aria-controls={listboxId}
              aria-autocomplete="list"
              className="pl-6 pr-6 py-1 text-[11px] bg-[#161616] border border-neutral-800 rounded text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-indigo-500/60 w-56"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  setShowSuggestions(false)
                  inputRef.current?.focus()
                }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-200"
                aria-label="Effacer la recherche"
              >
                <X className="w-3 h-3" />
              </button>
            ) : null}
            {showSuggestions && suggestions.length > 0 && dropdownRect
              ? createPortal(
                  <ul
                    ref={dropdownRef}
                    id={listboxId}
                    role="listbox"
                    style={{
                      position: 'fixed',
                      left: dropdownRect.left,
                      top: dropdownRect.top,
                      width: dropdownRect.width,
                      transform: 'translateY(-100%)',
                      marginTop: -4,
                    }}
                    className="z-[10000] max-h-72 overflow-y-auto rounded border border-neutral-800 bg-[#161616] shadow-xl shadow-black/60 py-1"
                  >
                    {suggestions.map((v, i) => {
                      const isActive = i === activeSuggestion
                      return (
                        <li
                          key={v}
                          role="option"
                          aria-selected={isActive}
                          onMouseEnter={() => setActiveSuggestion(i)}
                          onMouseDown={(e) => {
                            // mousedown plutôt que click : évite le blur de
                            // l'input qui fermerait le dropdown avant la sélection.
                            e.preventDefault()
                            setQuery(v)
                            setShowSuggestions(false)
                            inputRef.current?.focus()
                          }}
                          className={`px-2 py-1 text-[11px] cursor-pointer truncate ${
                            isActive
                              ? 'bg-indigo-500/15 text-neutral-100'
                              : 'text-neutral-300 hover:bg-[#1d1d1d]'
                          }`}
                          title={v}
                        >
                          {highlightMatch(v, query)}
                        </li>
                      )
                    })}
                  </ul>,
                  document.body,
                )
              : null}
          </div>

          <label className="flex items-center gap-1 text-neutral-500">
            <span className="text-[10px] uppercase tracking-wider">Lignes</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="text-[11px] bg-[#161616] border border-neutral-800 rounded px-1.5 py-1 text-neutral-200 focus:outline-none focus:border-indigo-500/60"
            >
              {PAGE_SIZE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Tableau avec scroll vertical interne et thead sticky */}
      <div
        ref={tableScrollRef}
        className="flex-1 min-h-0 rounded border border-neutral-800 overflow-auto"
      >
        <table className="text-xs w-max min-w-full">
          <thead className="bg-[#161616] sticky top-0 z-10 shadow-[inset_0_-1px_0_0_rgb(38,38,38)]">
            <tr>
              {cols.map((c) => {
                const isFocused = c.key === focusedKey
                return (
                  <th
                    key={c.key}
                    ref={(el) => {
                      headerRefs.current.set(c.key, el)
                    }}
                    className={`text-left px-2 py-1.5 font-medium whitespace-nowrap ${
                      isFocused
                        ? 'text-emerald-100 bg-emerald-500/15'
                        : 'text-neutral-400'
                    }`}
                  >
                    {c.label ?? c.key}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={cols.length}
                  className="px-3 py-6 text-center text-neutral-500 italic"
                >
                  Aucune ligne ne correspond à la recherche.
                </td>
              </tr>
            ) : (
              visibleRows.map((row, i) => (
                <tr key={start + i} className="odd:bg-[#0f0f0f] even:bg-[#141414]">
                  {cols.map((c) => {
                    const isFocused = c.key === focusedKey
                    return (
                      <td
                        key={c.key}
                        className={`px-2 py-1 border-b max-w-[200px] truncate ${
                          isFocused
                            ? 'text-emerald-100 bg-emerald-500/10 border-b-emerald-500/20'
                            : 'text-neutral-300 border-b-neutral-900'
                        }`}
                        title={formatCell(row[c.key])}
                      >
                        {formatCell(row[c.key])}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!showAll && pageCount > 1 ? (
        <div className="flex items-center justify-between text-[11px] text-neutral-500 shrink-0">
          <span>
            {filteredCount === 0
              ? 'Aucune ligne'
              : `${(start + 1).toLocaleString('fr-FR')}–${end.toLocaleString('fr-FR')} sur ${filteredCount.toLocaleString('fr-FR')}`}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => goToPage(safePage - 1)}
              disabled={safePage === 0}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-neutral-800 bg-[#161616] hover:bg-[#1d1d1d] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3 h-3" />
              Préc.
            </button>
            <span className="px-1.5">
              Page <span className="text-neutral-300">{safePage + 1}</span> / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => goToPage(safePage + 1)}
              disabled={safePage >= pageCount - 1}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-neutral-800 bg-[#161616] hover:bg-[#1d1d1d] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Suiv.
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function AssetGridPreview({ assets }: { assets: AssetLike[] }) {
  const items = assets.slice(0, MAX_ASSETS)
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-neutral-500">
        {assets.length} asset{assets.length > 1 ? 's' : ''}
        {assets.length > MAX_ASSETS ? ` · aperçu ${MAX_ASSETS} premiers` : ''}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
        {items.map((a, i) => {
          const url = a.url ?? a.src
          const isImg =
            (a.type === 'image' || (a.mimeType ?? '').startsWith('image/')) ||
            (typeof url === 'string' && /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url))
          return (
            <div
              key={i}
              className="aspect-square rounded border border-neutral-800 bg-[#161616] overflow-hidden flex items-center justify-center"
              title={a.name ?? url ?? ''}
            >
              {isImg && url ? (
                <img src={url} alt={a.name ?? ''} className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-neutral-500 text-[10px] px-1 text-center">
                  <FileImage className="w-5 h-5" />
                  <span className="truncate max-w-full">{a.name ?? a.type ?? 'asset'}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ExportPreview({ payload }: { payload: ExportLike }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded border border-neutral-800 bg-[#161616]">
      <div className="w-10 h-10 rounded bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-300">
        <FileText className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white truncate">{payload.filename}</div>
        {payload.mime ? <div className="text-[11px] text-neutral-500">{payload.mime}</div> : null}
      </div>
      <a
        href={payload.url}
        download={payload.filename}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-200 text-xs"
      >
        <Download className="w-3.5 h-3.5" />
        Télécharger
      </a>
    </div>
  )
}

function ProductsPreview({ value }: { value: unknown }) {
  const arr = Array.isArray(value)
    ? (value as Record<string, unknown>[])
    : Array.isArray((value as { products?: unknown[] })?.products)
      ? ((value as { products: Record<string, unknown>[] }).products)
      : null
  if (!arr || arr.length === 0) return <EmptyState label="Aucun produit" />
  // Reuse table renderer by synthesizing a sheet-like shape
  const keys = Array.from(
    arr.slice(0, 5).reduce<Set<string>>((acc, row) => {
      Object.keys(row).forEach((k) => acc.add(k))
      return acc
    }, new Set()),
  )
  return (
    <SheetPreview
      sheet={{
        name: `${arr.length} produit${arr.length > 1 ? 's' : ''}`,
        columns: keys.map((k) => ({ key: k })),
        rows: arr,
      }}
    />
  )
}

function JsonPreview({ value }: { value: unknown }) {
  let text: string
  try {
    text = JSON.stringify(value, null, 2)
  } catch {
    text = String(value)
  }
  return (
    <pre className="text-[11px] text-neutral-300 bg-[#0f0f0f] border border-neutral-800 rounded p-2">
      {text.slice(0, 4000)}
      {text.length > 4000 ? '\n…' : ''}
    </pre>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-xs text-neutral-500 italic px-2 py-3 text-center">
      {label}
    </div>
  )
}

function renderPreview(value: unknown) {
  // Sheet & products délèguent leur layout (gestion interne de la hauteur,
  // toolbar, pagination, sticky header). Les autres rendus sont enveloppés
  // dans un conteneur flex-scroll pour respecter le parent overflow-hidden.
  if (isSheet(value)) return <SheetPreview sheet={value} />
  if (Array.isArray(value)) return <ProductsPreview value={value} />
  if (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { products?: unknown[] }).products)
  ) {
    return <ProductsPreview value={value} />
  }
  const inner = isAssetArray(value) ? (
    <AssetGridPreview assets={value} />
  ) : isExportResult(value) ? (
    <ExportPreview payload={value} />
  ) : (
    <JsonPreview value={value} />
  )
  return <div className="flex-1 min-h-0 overflow-auto">{inner}</div>
}

export function DataPreviewPanel() {
  const states = useRunContext((s) => s.nodeStates)
  const isRunning = useRunContext((s) => s.isRunning)
  const wf = useWorkflowStore((s) => s.current)

  const selectedId = useStore((s) => {
    for (const n of s.nodeLookup.values()) {
      if ((n as { selected?: boolean }).selected) return (n as { id: string }).id
    }
    return undefined
  })

  const liveIds = useMemo(() => new Set((wf?.nodes ?? []).map((n) => n.id)), [wf])
  const labelFor = (id: string) => {
    const node = wf?.nodes.find((n) => n.id === id)
    const spec = node ? nodeRegistry.get(node.type) : undefined
    return spec?.label ?? node?.type ?? id
  }
  // Aucun node sélectionné ? On retombe sur le 1er Upload configuré du workflow,
  // pour que le panel affiche d'office la donnée principale au lieu d'un message
  // vide qui force l'utilisateur à cliquer.
  const fallbackUploadId = useMemo(() => {
    if (selectedId) return undefined
    return wf?.nodes.find((n) => {
      if (n.type !== 'upload') return false
      const cfg = n.config as UploadConfigLike
      return !!cfg?.fileKey
    })?.id
  }, [wf, selectedId])
  const effectiveSelectedId = selectedId ?? fallbackUploadId
  const runTarget = useMemo(
    () => pickLatestPreview(states, liveIds, labelFor),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [states, wf],
  )
  const staticTarget = useStaticNodePreview(wf ?? null, effectiveSelectedId, labelFor)
  const target = staticTarget ?? runTarget

  // 380 px = header (~28) + padding (~16) + toolbar (~24) + table header (~28)
  // + 10 lignes × ~23 + pagination (~22) + marges. Cale exactement le contenu
  // sur la pagination par défaut (`DEFAULT_PAGE_SIZE = 10`).
  // Suffixe `.v2` : invalide les hauteurs trop courtes sauvegardées avant.
  const { height, collapsed, setHeight, toggleCollapsed, minHeight, maxHeightVh } = usePanelResize({
    storageKey: 'web2print.bottomPanel.dataPreview.v2',
    defaultHeight: 380,
    minHeight: 140,
  })

  return (
    <div
      className="border-t border-neutral-800 bg-[#0f0f0f] text-sm flex flex-col shrink-0 relative"
      style={{ height: collapsed ? 30 : height }}
    >
      {!collapsed ? (
        <PanelResizeHandle
          height={height}
          onChange={setHeight}
          minHeight={minHeight}
          maxHeightVh={maxHeightVh}
        />
      ) : null}
      <button
        type="button"
        onClick={toggleCollapsed}
        className="px-4 py-1.5 text-xs uppercase text-neutral-500 flex items-center gap-2 border-b border-neutral-900 w-full text-left hover:bg-white/[0.02] transition-colors"
        aria-expanded={!collapsed}
        title={collapsed ? 'Déplier l’aperçu' : 'Replier l’aperçu'}
      >
        {collapsed ? (
          <ChevronUp className="w-3 h-3 text-neutral-600" />
        ) : (
          <ChevronDown className="w-3 h-3 text-neutral-600" />
        )}
        {target?.status === 'running' || isRunning ? (
          <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />
        ) : (
          <Eye className="w-3 h-3" />
        )}
        <span>Aperçu données</span>
        {target ? (
          <span className="text-neutral-600 normal-case truncate">
            · {target.nodeLabel}
            <span className="text-neutral-700"> → {target.portName}</span>
            {target.status === 'running' ? (
              <span className="ml-2 text-indigo-400">live</span>
            ) : null}
          </span>
        ) : null}
      </button>
      {!collapsed ? (
        <div className="flex-1 min-h-0 px-4 py-2 flex flex-col overflow-hidden">
          {target ? (
            target.status === 'error' && target.errorReason ? (
              <div className="flex items-start gap-2 text-xs text-amber-300/90 py-3">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span className="leading-snug">{target.errorReason}</span>
              </div>
            ) : target.value === null ? (
              <div className="flex items-center gap-2 text-xs text-neutral-500 py-3">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                Chargement de l’aperçu…
              </div>
            ) : (
              renderPreview(target.value)
            )
          ) : (
            <div className="flex items-center gap-2 text-xs text-neutral-500 italic py-3">
              <Table2 className="w-3.5 h-3.5" />
              Sélectionne un node Upload contenant un fichier, ou lance le workflow pour voir l’aperçu ici.
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
