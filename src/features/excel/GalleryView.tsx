// Vue galerie de la table de données : cartes produit (visuel, titre, prix,
// complétude). Détection heuristique des colonnes image/titre — aucune config.
import { useMemo } from 'react'
import { ImageOff } from 'lucide-react'
import type { ExcelColumn, ExcelRow, CellValue } from './types'
import { rowCompleteness, completenessTone } from './completeness'
import { t } from '@/lib/i18n'

interface GalleryViewProps {
  rows: ExcelRow[]
  columns: ExcelColumn[]
  onOpen: (rowId: string) => void
}

const IMAGE_KEY_RX = /image|photo|img|picture|visuel|thumbnail/i
const TITLE_KEYS = ['name', 'title', 'ai_name', 'nom', 'libelle', 'libellé', 'label', 'designation', 'désignation', 'produit']
const SUB_KEYS = ['price', 'prix', 'brand', 'marque', 'sku', 'ean']

function looksLikeImageUrl(v: CellValue): boolean {
  return typeof v === 'string' && /^https?:\/\//.test(v) && /\.(png|jpe?g|webp|gif|avif)(\?|$)|image/i.test(v)
}

/** Première URL exploitable d'une cellule (gère les listes « url1, url2 »). */
function firstImageUrl(v: CellValue): string | null {
  if (typeof v !== 'string' || !v.trim()) return null
  const first = v.split(/[,\n]/)[0]?.trim()
  return first && /^https?:\/\//.test(first) ? first : null
}

function findColumn(columns: ExcelColumn[], rows: ExcelRow[], keys: string[]): ExcelColumn | null {
  const lower = (s: string) => s.toLowerCase()
  for (const k of keys) {
    const col = columns.find((c) => lower(c.key) === k || lower(c.label) === k)
    if (col) return col
  }
  void rows
  return null
}

function findImageColumn(columns: ExcelColumn[], rows: ExcelRow[]): ExcelColumn | null {
  const byMeta = columns.find((c) => c.fieldType === 'image' || IMAGE_KEY_RX.test(c.key) || IMAGE_KEY_RX.test(c.label))
  if (byMeta) return byMeta
  // Fallback : colonne dont les premières valeurs ressemblent à des URLs d'image.
  const sample = rows.slice(0, 10)
  return columns.find((c) => sample.some((r) => looksLikeImageUrl(r[c.key]))) ?? null
}

export function GalleryView({ rows, columns, onOpen }: GalleryViewProps) {
  const imageCol = useMemo(() => findImageColumn(columns, rows), [columns, rows])
  const titleCol = useMemo(
    () => findColumn(columns, rows, TITLE_KEYS) ?? columns.find((c) => c !== imageCol && c.fieldType === 'text') ?? null,
    [columns, rows, imageCol],
  )
  const subCol = useMemo(() => findColumn(columns, rows, SUB_KEYS), [columns, rows])

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-3">
      {rows.map((row) => {
        const completeness = rowCompleteness(row, columns)
        const tone = completenessTone(completeness.pct)
        const toneCls =
          tone === 'emerald' ? 'bg-emerald-400/80' : tone === 'amber' ? 'bg-amber-400/80' : 'bg-red-400/80'
        const img = imageCol ? firstImageUrl(row[imageCol.key]) : null
        const title = titleCol ? String(row[titleCol.key] ?? '') : ''
        const sub = subCol ? String(row[subCol.key] ?? '') : ''
        return (
          <button
            key={row._id}
            onClick={() => onOpen(row._id)}
            className="group text-left bg-surface border border-white/[0.06] rounded-lg overflow-hidden hover:border-indigo-500/50 transition-colors"
            title="Ouvrir la fiche"
          >
            <div className="aspect-square bg-well flex items-center justify-center overflow-hidden">
              {img ? (
                <img
                  src={img}
                  alt={title || 'visuel produit'}
                  loading="lazy"
                  className="w-full h-full object-contain group-hover:scale-[1.03] transition-transform"
                />
              ) : (
                <ImageOff className="w-7 h-7 text-white/15" />
              )}
            </div>
            <div className="px-2.5 py-2">
              <div className="text-[12px] text-white/80 leading-snug line-clamp-2 min-h-[2.4em]">
                {title || <span className="text-white/25">Sans titre</span>}
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[11px] text-white/40 truncate">{sub}</span>
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ml-2 ${toneCls}`}
                  title={t('xl.completeness', { pct: completeness.pct })}
                />
              </div>
            </div>
          </button>
        )
      })}
      {rows.length === 0 && (
        <p className="col-span-full text-center text-sm text-white/30 py-12">{t('xl.noProduct')}</p>
      )}
    </div>
  )
}
