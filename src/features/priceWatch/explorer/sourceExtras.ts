// Jointure « produit source ↔ ligne de la base PIM », pour les champs que le catalogue
// persisté de la veille ne porte PAS : description et visuels.
//
// ⚠ Pourquoi ne pas les ajouter au catalogue persisté ? `saveSourceCatalog` chunke par
// NOMBRE (2 000 produits/doc) sans budget d'octets, contrairement à `saveCatalogReport`.
// Des descriptions de quelques centaines d'octets suffiraient à faire dépasser la limite
// dure de 1 Mo/doc — et l'échec remonte en AVERTISSEMENT de fin de run, pas en erreur.
// On lit donc la base PIM, qui les porte déjà et reste fraîche sans relancer « Comparer ».
// PUR : aucune dépendance React/Firebase.
import type { ExcelColumn, ExcelRow, CellValue } from '@/features/excel/types'
import { resolveCompareColumns } from '../catalog/compareColumns'
import { normalizeEan } from '../catalog/keys'
import type { SourceProduct } from '../catalog/match'

const IMAGE_KEY_RX = /image|photo|img|picture|visuel|illustration|thumbnail/i

export interface SourceExtrasIndex {
  /** Colonnes retenues (affichées à l'utilisateur : la détection doit être vérifiable). */
  descriptionKey: string | null
  imageKeys: string[]
  /** Nombre de lignes indexées (0 = jointure impossible, base sans réf ni EAN). */
  size: number
  lookup: (p: SourceProduct) => { description: string | null; images: string[] }
}

const EMPTY: SourceExtrasIndex = {
  descriptionKey: null, imageKeys: [], size: 0,
  lookup: () => ({ description: null, images: [] }),
}

function str(v: CellValue): string {
  return v == null ? '' : String(v).trim()
}

/** Réf normalisée pour la jointure : casse et séparateurs neutralisés. */
function refKey(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** URLs d'images d'une cellule — une cellule peut en lister plusieurs (« a.jpg, b.jpg »). */
function imageUrls(v: CellValue): string[] {
  const s = str(v)
  if (!s) return []
  return s.split(/[,;\n|]/).map((u) => u.trim()).filter((u) => /^https?:\/\//.test(u))
}

/** Colonnes d'images : type de champ déclaré, nom évocateur, ou valeurs qui en sont. */
function findImageKeys(columns: ExcelColumn[], rows: ExcelRow[]): string[] {
  const byMeta = columns.filter((c) => c.fieldType === 'image' || IMAGE_KEY_RX.test(c.key) || IMAGE_KEY_RX.test(c.label))
  if (byMeta.length > 0) return byMeta.map((c) => c.key)
  const sample = rows.slice(0, 40)
  return columns
    .filter((c) => sample.some((r) => imageUrls(r[c.key]).some((u) => /\.(png|jpe?g|webp|gif|avif)(\?|$)|image/i.test(u))))
    .map((c) => c.key)
}

/**
 * Indexe une feuille PIM par référence ET par EAN. Les deux clés pointent la même ligne :
 * un produit source dont la réf n'est pas dans la base peut être retrouvé par son EAN.
 */
export function buildSourceExtras(
  columns: ExcelColumn[],
  rows: ExcelRow[],
  configured: { ref?: string; ean?: string; description?: string } = {},
): SourceExtrasIndex {
  if (rows.length === 0) return EMPTY
  const cols = columns.map((c) => ({ key: c.key, label: c.label }))
  const resolved = resolveCompareColumns(cols, {
    ref: configured.ref ?? '', ean: configured.ean ?? '', description: configured.description ?? '',
  })
  const refKeyCol = resolved.columns.ref
  const eanKeyCol = resolved.columns.ean
  const descKey = resolved.columns.description ?? null
  const imageKeys = findImageKeys(columns, rows)
  if (!refKeyCol && !eanKeyCol) return { ...EMPTY, descriptionKey: descKey, imageKeys }

  const byRef = new Map<string, ExcelRow>()
  const byEan = new Map<string, ExcelRow>()
  for (const row of rows) {
    if (refKeyCol) {
      const k = refKey(str(row[refKeyCol]))
      if (k && !byRef.has(k)) byRef.set(k, row)
    }
    if (eanKeyCol) {
      const k = normalizeEan(str(row[eanKeyCol]))
      if (k && !byEan.has(k)) byEan.set(k, row)
    }
  }

  const extract = (row: ExcelRow) => ({
    description: descKey ? (str(row[descKey]) || null) : null,
    images: imageKeys.flatMap((k) => imageUrls(row[k])).slice(0, 6),
  })

  return {
    descriptionKey: descKey,
    imageKeys,
    size: Math.max(byRef.size, byEan.size),
    lookup: (p) => {
      const ean = normalizeEan(p.ean)
      const row = (ean && byEan.get(ean))
        || (p.ref && byRef.get(refKey(p.ref)))
        || (p.ref2 && byRef.get(refKey(p.ref2)))
      return row ? extract(row) : { description: null, images: [] }
    },
  }
}
