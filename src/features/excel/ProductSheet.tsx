import { useState, useRef, useCallback, useEffect } from 'react'
import {
  X, ChevronLeft, ChevronRight, Copy, Check, ExternalLink,
  Tag, Barcode, FileText, Play, Link2, Download, Zap, Database,
} from 'lucide-react'
import { useExcelStore } from '@/stores/excel.store'
import { evaluateFormula } from './formulaEngine'
import { getLevelColor } from './taxonomyBuilder'
import type { ExcelColumn, CellValue, FieldTypeId } from './types'
import { EnrichmentPanel } from './ai-enrichment/EnrichmentPanel'

interface Props {
  rowId: string
  allRowIds: string[]
  onClose: () => void
  onNavigate: (rowId: string) => void
}

const NUMERIC_TYPES: FieldTypeId[] = ['number', 'currency', 'percent', 'rating']
const IMG_EXTS = /\.(jpe?g|png|webp|gif|avif|svg)(\?.*)?$/i
const PDF_EXT  = /\.pdf(\?.*)?$/i
const VIDEO_EXT = /\.(mp4|webm|mov|avi)(\?.*)?$/i

// ── Helpers ───────────────────────────────────────────────────────────────────

const isImageUrl = (v: CellValue): v is string =>
  typeof v === 'string' && v.startsWith('http') && IMG_EXTS.test(v)

const isImageCol = (col: ExcelColumn, rows: Record<string, CellValue>[]): boolean => {
  if (col.fieldType === 'image') return true
  const sample = rows.find(r => typeof r[col.key] === 'string' && (r[col.key] as string).startsWith('http'))
  if (!sample) return false
  const v = String(sample[col.key])
  // Tester chaque partie si la valeur est une liste pipe-séparée
  return v.split(' | ').some(p => p.startsWith('http') && IMG_EXTS.test(p.trim()))
}

const parseImageList = (v: CellValue): string[] => {
  if (typeof v !== 'string') return []
  // Toujours splitter d'abord si la valeur est une liste pipe-séparée
  if (v.includes(' | ')) {
    return v.split(' | ').map(s => s.trim()).filter(isImageUrl)
  }
  return isImageUrl(v) ? [v] : []
}

// "Label: Val | Label: Val" → [{name,value}] or null
const parseSpecTable = (v: string): { name: string; value: string }[] | null => {
  const parts = v.split(' | ').map(s => s.trim()).filter(Boolean)
  if (parts.length < 2) return null
  const parsed = parts.map(p => {
    const idx = p.indexOf(':')
    if (idx === -1) return null
    return { name: p.slice(0, idx).trim(), value: p.slice(idx + 1).trim() }
  })
  if (parsed.some(p => !p)) return null
  return parsed as { name: string; value: string }[]
}

// "Item 1 | Item 2" → string[] (no key:value pattern)
const parseBulletList = (v: string): string[] | null => {
  const parts = v.split(' | ').map(s => s.trim()).filter(Boolean)
  if (parts.length < 2) return null
  if (parts.some(p => p.includes(':'))) return null
  return parts
}

// Detect URLs (PDF, video, generic)
const isAnyUrl = (v: string) => /^https?:\/\//i.test(v)
const isPdfUrl  = (v: string) => isAnyUrl(v) && PDF_EXT.test(v)
const isVideoUrl = (v: string) => isAnyUrl(v) && VIDEO_EXT.test(v)
const isYoutube  = (v: string) => /youtube\.com|youtu\.be/i.test(v)

// Column key matchers
const isRefKey    = (k: string) => /ref(erence)?|sku|code|modele/i.test(k)
const isPriceKey  = (k: string) => /prix|price|tarif/i.test(k)
const isDescKey   = (k: string) => /desc|accroche|subtitle|sous.?titre/i.test(k)
const isAvailKey  = (k: string) => /dispo|stock|avail/i.test(k)
const isEanKey    = (k: string) => /ean|barcode|code.?barre/i.test(k)
const isSpecKey   = (k: string) => /spec|tech|caract/i.test(k)
const isAdvKey    = (k: string) => /avantage|advantage|feature|benefit/i.test(k)
const isBrandKey  = (k: string) => /marque|brand|fabricant/i.test(k)
const isDocKey    = (k: string) => /^documents?$|pdf|video|notice|lien|link|url/i.test(k)
/** Libellé produit — utilisé en priorité sur `isPrimary` pour l'enrichissement IA
 *  (la primary est souvent mal détectée à l'import — cf. useExcelImport.ts). */
const isTitleKey  = (k: string) => /libell|d[eé]signation|nom.?(article|produit)?|titre|title|product.?name/i.test(k)

type Tab = 'general' | 'specs' | 'documents'

// ── Main component ────────────────────────────────────────────────────────────

export function ProductSheet({ rowId, allRowIds, onClose, onNavigate }: Props) {
  const { sheets, activeSheetIndex, updateCell } = useExcelStore()
  const sheet = sheets[activeSheetIndex]
  const [activeImg, setActiveImg] = useState(0)
  const [tab, setTab] = useState<Tab>('general')
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // Split resizable entre panneau source (gauche) et enrichissement IA (droite)
  const splitContainerRef = useRef<HTMLDivElement>(null)
  const [leftRatio, setLeftRatio] = useState<number>(() => {
    if (typeof window === 'undefined') return 0.5
    const stored = window.localStorage.getItem('productSheet.splitRatio')
    const parsed = stored ? Number(stored) : NaN
    return Number.isFinite(parsed) && parsed >= 0.2 && parsed <= 0.8 ? parsed : 0.5
  })
  const draggingRef = useRef(false)

  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current || !splitContainerRef.current) return
      const rect = splitContainerRef.current.getBoundingClientRect()
      const ratio = (e.clientX - rect.left) / rect.width
      const clamped = Math.max(0.2, Math.min(0.8, ratio))
      setLeftRatio(clamped)
    }
    const onUp = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      try {
        window.localStorage.setItem('productSheet.splitRatio', String(leftRatio))
      } catch { /* noop */ }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [leftRatio])

  if (!sheet) return null
  const row = sheet.rows.find(r => r._id === rowId)
  if (!row) return null

  const currentIdx = allRowIds.indexOf(rowId)
  const hasPrev = currentIdx > 0
  const hasNext = currentIdx < allRowIds.length - 1

  const hiddenCols = new Set(sheet.hiddenColumns ?? [])
  const visibleCols = sheet.columns.filter(c => !hiddenCols.has(c.key))
  const levels = sheet.taxonomyLevels ?? {}

  const getValue = (col: ExcelColumn): CellValue =>
    col.fieldType === 'formula' && col.formula
      ? evaluateFormula(col.formula, row, sheet.columns)
      : row[col.key]

  const fmt = (value: CellValue, col: ExcelColumn): string => {
    if (value === null || value === undefined || value === '') return '—'
    if (col.fieldType === 'checkbox') return value ? 'Oui' : 'Non'
    // parseFloat français : "84,90" → 84.9 (on remplace la virgule décimale)
    const num = typeof value === 'number'
      ? value
      : parseFloat(String(value).replace(/\s/g, '').replace(',', '.'))
    // Décimales configurées sur la colonne, défaut 2 (aligné avec DataTable.tsx)
    const decimals = col.decimals ?? 2
    const formatNum = (n: number) =>
      n.toLocaleString('fr-FR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    if (col.fieldType === 'currency' && !isNaN(num)) return `${formatNum(num)} €`
    if (col.fieldType === 'percent' && !isNaN(num)) return `${formatNum(num)}%`
    if (col.fieldType === 'rating' && !isNaN(num)) return '★'.repeat(Math.round(num)) + '☆'.repeat(Math.max(0, 5 - Math.round(num)))
    if (col.fieldType === 'number' && !isNaN(num)) return formatNum(num)
    return String(value)
  }

  const commitEdit = (colKey: string) => {
    const col = sheet.columns.find(c => c.key === colKey)
    let v: CellValue = editValue
    if (col && NUMERIC_TYPES.includes(col.fieldType)) {
      const n = parseFloat(editValue.replace(',', '.').replace(/[€$%]/g, ''))
      v = isNaN(n) ? editValue : n
    }
    updateCell(activeSheetIndex, rowId, colKey, v)
    setEditingField(null)
  }

  const copy = (val: string, key: string) => {
    navigator.clipboard.writeText(val)
    setCopiedField(key)
    setTimeout(() => setCopiedField(null), 1500)
  }

  // ── Classify columns ────────────────────────────────────────────────────────
  const primaryCol = visibleCols.find(c => c.isPrimary) ?? visibleCols[0]
  const title = primaryCol ? String(getValue(primaryCol) ?? '') : `Ligne ${currentIdx + 1}`
  const taxoCols = visibleCols.filter(c => (levels[c.key] ?? 0) > 0)
    .sort((a, b) => (levels[a.key] ?? 0) - (levels[b.key] ?? 0))
  const imageCols = visibleCols.filter(c => c.key !== primaryCol?.key && !c.key.startsWith('ai_') && isImageCol(c, sheet.rows))

  const allImages: string[] = []
  imageCols.forEach(col => allImages.push(...parseImageList(getValue(col))))
  const uniqueImages = [...new Set(allImages)]

  const contentCols = visibleCols.filter(c =>
    c.key !== primaryCol?.key &&
    (levels[c.key] ?? 0) === 0 &&
    !imageCols.some(ic => ic.key === c.key) &&
    !c.key.startsWith('ai_') // colonnes IA affichées dans le panneau droit uniquement
  )

  // Separate into tabs
  const specCols = contentCols.filter(c => isSpecKey(c.key))
  const docCols  = contentCols.filter(c => {
    if (isDocKey(c.key)) return true
    const v = getValue(c)
    return typeof v === 'string' && isAnyUrl(v) && !isImageUrl(v)
  })
  const docColKeys = new Set(docCols.map(c => c.key))
  const specColKeys = new Set(specCols.map(c => c.key))
  const generalCols = contentCols.filter(c => !specColKeys.has(c.key) && !docColKeys.has(c.key))

  // Count tabs with content
  const hasSpecs = specCols.length > 0
  const hasDocs  = docCols.length > 0

  // ── Enrichment input (pour le panneau IA) ───────────────────────────────────
  const firstValue = (predicate: (c: ExcelColumn) => boolean): string | undefined => {
    const col = visibleCols.find(predicate)
      ?? sheet.columns.find(predicate)
    if (!col) return undefined
    const v = getValue(col)
    return v == null || v === '' ? undefined : String(v)
  }

  // Libellé produit : priorité aux clés explicites (libellé/désignation/nom article).
  // Fallback : `primaryCol` si elle n'est pas une colonne de taxonomie, ni ref/brand/price.
  // Ignore `title` (= primaryCol header) qui est souvent la racine taxonomique sur fichiers mal marqués.
  const isTaxoCol = (c: ExcelColumn) => (levels[c.key] ?? 0) > 0
  const isMetaCol = (c: ExcelColumn) =>
    isRefKey(c.key) || isBrandKey(c.key) || isPriceKey(c.key) ||
    isAvailKey(c.key) || isEanKey(c.key) || isDocKey(c.key) ||
    isImageCol(c, sheet.rows) || c.key.startsWith('ai_')
  const titleCol = visibleCols.find(c => !isTaxoCol(c) && isTitleKey(c.key))
    ?? (primaryCol && !isTaxoCol(primaryCol) && !isMetaCol(primaryCol) ? primaryCol : undefined)
    ?? visibleCols.find(c => !isTaxoCol(c) && !isMetaCol(c) && !isDescKey(c.key) && !isSpecKey(c.key) && !isAdvKey(c.key))
  const productTitle = titleCol ? String(getValue(titleCol) ?? '').trim() : ''

  // Chemin de catégorie taxonomique (ex: "Électronique > Informatique > Ordinateurs portables")
  // — donne au LLM le contexte pour détecter une incohérence avec le libellé scrapé.
  const taxoColsAll = visibleCols
    .filter(c => (levels[c.key] ?? -1) >= 0 && c.key in levels)
    .sort((a, b) => (levels[a.key] ?? 0) - (levels[b.key] ?? 0))
  const categoryPath = taxoColsAll
    .map(c => String(getValue(c) ?? '').trim())
    .filter(Boolean)
    .join(' > ') || undefined

  const enrichmentInput = {
    sheetName: sheet.name,
    rowId,
    title: productTitle,
    brand: firstValue(c => isBrandKey(c.key) || isBrandKey(c.label)),
    sku: firstValue(c => isRefKey(c.key) || isRefKey(c.label)),
    reference: firstValue(c => isRefKey(c.key) || isRefKey(c.label)),
    description: firstValue(c => isDescKey(c.key) || isDescKey(c.label)),
    category: categoryPath,
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-[#141416] text-white">

      {/* Nav bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] shrink-0 bg-[#111113]">
        <div className="flex items-center gap-0.5">
          <NavBtn disabled={!hasPrev} onClick={() => { setActiveImg(0); onNavigate(allRowIds[currentIdx - 1]) }}>
            <ChevronLeft className="w-3.5 h-3.5" />
          </NavBtn>
          <span className="text-[10px] text-white/30 tabular-nums px-1.5">{currentIdx + 1} / {allRowIds.length}</span>
          <NavBtn disabled={!hasNext} onClick={() => { setActiveImg(0); onNavigate(allRowIds[currentIdx + 1]) }}>
            <ChevronRight className="w-3.5 h-3.5" />
          </NavBtn>
        </div>
        <NavBtn onClick={onClose}><X className="w-3.5 h-3.5" /></NavBtn>
      </div>

      {/* Image gallery */}
      {uniqueImages.length > 0 && (
        <div className="bg-[#f0f0f0] border-b border-white/[0.06] shrink-0">
          <div className="relative flex items-center justify-center h-56 overflow-hidden">
            <img src={uniqueImages[activeImg]} alt={title}
              className="max-h-full max-w-full object-contain"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            {activeImg > 0 && (
              <button onClick={() => setActiveImg(i => i - 1)}
                className="absolute left-2 p-1 rounded-full bg-black/50 text-white/60 hover:text-white hover:bg-black/70 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            {activeImg < uniqueImages.length - 1 && (
              <button onClick={() => setActiveImg(i => i + 1)}
                className="absolute right-2 p-1 rounded-full bg-black/50 text-white/60 hover:text-white hover:bg-black/70 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            {uniqueImages.length > 1 && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                {uniqueImages.map((_, i) => (
                  <button key={i} onClick={() => setActiveImg(i)}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${i === activeImg ? 'bg-white/70' : 'bg-white/20 hover:bg-white/40'}`} />
                ))}
              </div>
            )}
          </div>
          {uniqueImages.length > 1 && (
            <div className="flex gap-1.5 px-3 pb-2.5 overflow-x-auto">
              {uniqueImages.map((url, i) => (
                <button key={i} onClick={() => setActiveImg(i)}
                  className={`shrink-0 w-10 h-10 rounded border overflow-hidden bg-white transition-all ${
                    i === activeImg ? 'border-indigo-400/60 ring-1 ring-indigo-400/20' : 'border-white/10 opacity-60 hover:opacity-100'
                  }`}>
                  <img src={url} alt="" className="w-full h-full object-contain p-0.5"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Product title block */}
      <div className="px-5 pt-4 pb-3 border-b border-white/[0.06] shrink-0 bg-[#141416]">
        {taxoCols.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {taxoCols.map(col => {
              const val = row[col.key]; if (!val) return null
              const color = getLevelColor(levels[col.key])
              return (
                <span key={col.key} className="text-[10px] font-medium px-2 py-[2px] rounded-full"
                  style={{ backgroundColor: `${color}18`, color, border: `1px solid ${color}30` }}>
                  {String(val)}
                </span>
              )
            })}
          </div>
        )}
        <h2 className="text-[16px] font-bold text-white leading-snug">{title || '—'}</h2>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          {contentCols.filter(c => isRefKey(c.key)).map(col => {
            const v = getValue(col); if (!v) return null
            return (
              <span key={col.key} className="inline-flex items-center gap-1.5 text-[11px] font-mono text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded">
                <Tag className="w-2.5 h-2.5 opacity-60" />{String(v)}
              </span>
            )
          })}
          {contentCols.filter(c => isBrandKey(c.key)).map(col => {
            const v = getValue(col); if (!v) return null
            return <span key={col.key} className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">{String(v)}</span>
          })}
          {contentCols.filter(c => isAvailKey(c.key)).map(col => {
            const v = getValue(col); if (!v) return null
            const ok = /stock|dispo|available/i.test(String(v)) && !/rupture|out|unavail/i.test(String(v))
            return (
              <span key={col.key} className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full border ${ok ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' : 'bg-red-500/10 text-red-400 border-red-500/25'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />{String(v)}
              </span>
            )
          })}
          {contentCols.filter(c => isEanKey(c.key)).map(col => {
            const v = getValue(col); if (!v) return null
            return (
              <span key={col.key} className="inline-flex items-center gap-1.5 text-[11px] font-mono text-white/40 bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded">
                <Barcode className="w-2.5 h-2.5 opacity-50" />{String(v)}
              </span>
            )
          })}
          {(() => {
            const priceCols = contentCols.filter(c => isPriceKey(c.key)).filter(col => {
              const v = getValue(col); return v !== null && v !== undefined && v !== ''
            })
            if (priceCols.length === 0) return null
            return (
              <div className="ml-auto flex items-stretch gap-1">
                {priceCols.map((col, i) => {
                  const v = getValue(col)
                  return (
                    <div
                      key={col.key}
                      className={`flex flex-col items-end justify-center px-2.5 py-1 rounded-md bg-emerald-500/[0.06] border border-emerald-500/15 ${i > 0 ? '' : ''}`}
                    >
                      <span className="text-[16px] font-bold text-emerald-400 leading-none tabular-nums">
                        {fmt(v, col)}
                      </span>
                      <span className="text-[9px] font-medium uppercase tracking-wider text-emerald-300/50 leading-none mt-0.5">
                        {col.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      </div>

      {/* Split layout : source (gauche) | enrichissement IA (droite) — resize manuel via divider */}
      <div ref={splitContainerRef} className="flex-1 flex min-h-0 w-full overflow-hidden">

      {/* ── Colonne gauche : données source ──────────────────────────────── */}
      <div
        className="min-w-0 min-h-0 flex flex-col overflow-hidden shrink-0"
        style={{ width: `${leftRatio * 100}%` }}
      >

      {/* Source label */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06] bg-[#111113] shrink-0">
        <div className="w-5 h-5 rounded-md bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
          <Database className="w-3 h-3 text-white/50" />
        </div>
        <span className="text-[11px] font-semibold text-white/60 uppercase tracking-wider">
          Source
        </span>
      </div>

      {/* Tabs — "Général" retiré : c'est la vue par défaut, on n'affiche que les tabs spécialisées.
         Click sur une tab active = retour à la vue générale. */}
      {(hasSpecs || hasDocs) && (
        <div className="flex border-b border-white/[0.06] shrink-0 bg-[#111113]">
          {([
            ...(hasSpecs ? [{ id: 'specs' as Tab, label: 'Spécifications' }] : []),
            ...(hasDocs  ? [{ id: 'documents' as Tab, label: 'Documents' }] : []),
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(tab === t.id ? 'general' : t.id)}
              className={`flex-1 px-3 py-2.5 text-[11px] font-semibold transition-colors ${
                tab === t.id
                  ? 'text-indigo-400 border-b-2 border-indigo-400 bg-indigo-500/[0.04]'
                  : 'text-white/35 hover:text-white/60 border-b-2 border-transparent'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto min-h-0">

        {/* ── GÉNÉRAL ── */}
        {tab === 'general' && (
          <div className="py-1">
            {/* Description */}
            {generalCols.filter(c => isDescKey(c.key)).map(col => {
              const v = getValue(col); if (!v || v === '—') return null
              return (
                <div key={col.key} className="px-5 pt-4 pb-3 border-b border-white/[0.04]">
                  <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">
                    {/subtitle|sous.?titre/i.test(col.key) ? 'Nom' : col.label}
                  </p>
                  <p className="text-[13px] text-white/65 leading-relaxed">{String(v)}</p>
                </div>
              )
            })}

            {/* Advantages */}
            {generalCols.filter(c => isAdvKey(c.key)).map(col => {
              const v = getValue(col); if (!v) return null
              // Split par " | " en priorité (données scrapées), sinon par saut de ligne
              const raw = String(v)
              const bullets = raw.includes(' | ')
                ? raw.split(' | ').map(s => s.trim()).filter(Boolean)
                : raw.split('\n').map(s => s.trim()).filter(Boolean)
              return (
                <div key={col.key} className="px-5 pt-4 pb-3 border-b border-white/[0.04]">
                  <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <Zap className="w-3 h-3 text-amber-400/60" />{col.label}
                  </p>
                  <ul className="space-y-2">
                    {bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-[12px] text-white/65 leading-relaxed">
                        <Check className="mt-[2px] w-3.5 h-3.5 text-emerald-400/70 shrink-0" />{b}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}


            {/* Remaining general fields — inclut les champs méta (ref, marque,
               EAN, prix, dispo) pour qu'ils soient tous visibles et éditables
               dans le panneau source. Les chips en en-tête en sont un résumé
               visuel, les lignes ici sont la version labellisée/modifiable. */}
            {generalCols.filter(c => !isDescKey(c.key) && !isAdvKey(c.key) && !isPriceKey(c.key)).map(col => {
              const v = getValue(col)
              if (v === null || v === undefined || v === '') return null
              return (
                <div key={col.key} className="group flex items-start gap-3 px-5 py-2.5 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <span className="text-[11px] text-white/35 w-28 shrink-0 pt-[1px] truncate">{col.label}</span>
                  <div className="flex-1 min-w-0">
                    {editingField === col.key ? (
                      <textarea autoFocus value={editValue} rows={1}
                        ref={(el) => {
                          if (!el) return
                          // Auto-resize à l'ouverture pour afficher tout le contenu
                          el.style.height = 'auto'
                          el.style.height = `${el.scrollHeight}px`
                        }}
                        onChange={e => {
                          setEditValue(e.target.value)
                          // Auto-resize pendant la saisie
                          e.currentTarget.style.height = 'auto'
                          e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`
                        }}
                        onBlur={() => commitEdit(col.key)}
                        onKeyDown={e => {
                          // Entrée valide, Shift+Entrée = nouvelle ligne
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(col.key) }
                          if (e.key === 'Escape') setEditingField(null)
                        }}
                        className="w-full bg-white/[0.04] border border-indigo-500/40 rounded px-2 py-1 text-[12px] text-white outline-none resize-none leading-relaxed break-words" />
                    ) : (
                      <p className="text-[12px] text-white/65 leading-relaxed break-words cursor-pointer hover:text-white/90 transition-colors"
                        onClick={() => { setEditingField(col.key); setEditValue(v != null ? String(v) : '') }}>
                        {fmt(v, col)}
                      </p>
                    )}
                  </div>
                  <button onClick={() => copy(String(v), col.key)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-white/20 hover:text-white/60 transition-colors shrink-0 mt-[1px]">
                    {copiedField === col.key ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* ── SPÉCIFICATIONS ── */}
        {tab === 'specs' && (() => {
          // Aplatir toutes les colonnes specs en une seule liste {name, value}
          const allSpecs = specCols.flatMap(col => {
            const v = getValue(col)
            const parsed = v ? parseSpecTable(String(v)) : null
            if (parsed) return parsed
            if (!v) return []
            return [{ name: col.label, value: fmt(v, col) }]
          })
          return (
            <div className="py-4 px-4">
              {allSpecs.length === 0 ? (
                <p className="text-[12px] text-white/30 text-center py-8">Aucune spécification</p>
              ) : (
                <div className="rounded-xl border border-white/[0.08] overflow-hidden">
                  {allSpecs.map((s, i) => (
                    <div key={i} className={`flex items-stretch min-h-[36px] ${i % 2 === 0 ? 'bg-white/[0.025]' : 'bg-transparent'} ${i > 0 ? 'border-t border-white/[0.04]' : ''}`}>
                      <div className="w-[48%] px-4 py-2 border-r border-white/[0.05] shrink-0 flex items-center">
                        <span className="text-[11.5px] text-white/45 leading-snug">{s.name}</span>
                      </div>
                      <div className="flex-1 px-4 py-2 flex items-center">
                        <span className={`text-[12px] leading-snug font-medium ${s.value ? 'text-white/80' : 'text-white/20'}`}>
                          {s.value || '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })()}

        {/* ── DOCUMENTS ── */}
        {tab === 'documents' && (
          <div className="py-3 px-4 space-y-2">
            {docCols.map(col => {
              const v = getValue(col)
              if (!v) return null
              const raw = String(v)
              // May contain multiple URLs separated by " | "
              // For doc columns, keep only valid URLs; for generic URL values keep all non-empty
              const isDocColumn = isDocKey(col.key)
              const links = raw.split(' | ').map(s => s.trim()).filter(s => isDocColumn ? isAnyUrl(s) : s.length > 0)
              if (links.length === 0) return null

              return (
                <div key={col.key}>
                  {links.length > 1 && (
                    <p className="text-[10px] font-semibold text-white/25 uppercase tracking-wider mb-1.5 px-1">{col.label}</p>
                  )}
                  {links.map((link, i) => {
                    const isUrl = isAnyUrl(link)
                    const isPdf = isPdfUrl(link)
                    const isVid = isVideoUrl(link) || isYoutube(link)
                    const filename = link.split('/').pop()?.split('?')[0] ?? link
                    const label = links.length === 1 ? col.label : filename

                    return (
                      <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                        isUrl
                          ? 'bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.06] hover:border-white/[0.12] cursor-pointer'
                          : 'bg-white/[0.02] border-white/[0.05]'
                      }`}
                        onClick={() => isUrl && window.open(link, '_blank')}>
                        {/* Icon */}
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isPdf ? 'bg-red-500/15' : isVid ? 'bg-purple-500/15' : 'bg-indigo-500/15'
                        }`}>
                          {isPdf  ? <FileText className="w-4 h-4 text-red-400" /> :
                           isVid  ? <Play className="w-4 h-4 text-purple-400" /> :
                                    <Link2 className="w-4 h-4 text-indigo-400" />}
                        </div>
                        {/* Label */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-white/70 truncate">{label}</p>
                          {isUrl && (
                            <p className="text-[10px] text-white/30 truncate">{link.replace(/^https?:\/\//,'').slice(0,60)}</p>
                          )}
                        </div>
                        {/* Action */}
                        {isUrl && (
                          <div className="flex gap-1 shrink-0">
                            {isPdf && (
                              <a href={link} download onClick={e => e.stopPropagation()}
                                className="p-1.5 text-white/25 hover:text-white/70 hover:bg-white/[0.06] rounded-lg transition-colors">
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            )}
                            <span className="p-1.5 text-white/20">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {/* Empty state : tab visible mais aucun lien trouvé */}
            {docCols.every(col => {
              const v = getValue(col); if (!v) return true
              const isDocColumn = isDocKey(col.key)
              return String(v).split(' | ').map(s => s.trim()).filter(s => isDocColumn ? isAnyUrl(s) : s.length > 0).length === 0
            }) && (
              <div className="flex flex-col items-center justify-center py-10 gap-3 text-white/20">
                <FileText className="w-8 h-8 opacity-30" />
                <p className="text-[12px]">Aucun lien de document trouvé</p>
                <p className="text-[10px] text-white/15 text-center leading-relaxed max-w-[200px]">
                  Re-scrapez avec le template&nbsp;<strong className="text-white/25">Produit complet</strong> et activez<br/>
                  <em>waitFor 3s</em> pour les contenus dynamiques
                </p>
              </div>
            )}
          </div>
        )}

        <div className="h-4" />
      </div>
      </div>
      {/* ── /Colonne gauche ───────────────────────────────────────────────── */}

      {/* ── Divider draggable ─────────────────────────────────────────────── */}
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={onDividerMouseDown}
        onDoubleClick={() => {
          setLeftRatio(0.5)
          try { window.localStorage.setItem('productSheet.splitRatio', '0.5') } catch { /* noop */ }
        }}
        className="group relative w-1 shrink-0 cursor-col-resize bg-white/[0.06] hover:bg-indigo-400/40 active:bg-indigo-400/60 transition-colors"
        title="Glisser pour redimensionner — double-clic pour réinitialiser"
      >
        {/* Zone de capture élargie pour faciliter le grab */}
        <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
        {/* Indicateur visuel au hover */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-8 rounded-full bg-white/20 group-hover:bg-indigo-300 transition-colors" />
      </div>

      {/* ── Colonne droite : enrichissement IA ───────────────────────────── */}
      <div className="min-w-0 min-h-0 flex-1 flex flex-col overflow-hidden">
        <EnrichmentPanel input={enrichmentInput} />
      </div>
      </div>
      {/* ── /Split layout ─────────────────────────────────────────────────── */}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function NavBtn({ children, onClick, disabled }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="p-1 rounded-md text-white/35 hover:text-white/70 hover:bg-white/5 transition-colors disabled:opacity-20 disabled:cursor-not-allowed">
      {children}
    </button>
  )
}
