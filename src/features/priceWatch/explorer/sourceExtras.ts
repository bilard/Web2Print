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
import { resolveCompareColumns, foldHeader } from '../catalog/compareColumns'
import { normalizeEan } from '../catalog/keys'
import type { SourceProduct } from '../catalog/match'
// ⚠ MÊME dictionnaire que le node « Comparer catalogue ». Deux listes d'alias distinctes,
// c'étaient deux arbres différents selon que la taxonomie venait du catalogue persisté ou
// de la base PIM de repli — le niveau UNIVERS n'existant que d'un côté.
import { TAXO_LEVELS } from '../catalog/displayColumns'

const IMAGE_KEY_RX = /image|photo|img|picture|visuel|illustration|thumbnail/i

export interface SourceExtrasIndex {
  /** Colonnes retenues (affichées à l'utilisateur : la détection doit être vérifiable). */
  descriptionKey: string | null
  /** Colonne portant l'adresse de MA fiche produit. Beaucoup de catalogues la portent
   *  déjà (« URL », « Lien produit ») : la lire évite de faire saisir un gabarit. */
  urlKey: string | null
  imageKeys: string[]
  /** Colonnes de taxonomie par niveau (null = niveau absent de la base). */
  taxoKeys: (string | null)[]
  /** Libellés des niveaux réellement trouvés, pour l'en-tête de l'arbre. */
  taxoLabels: string[]
  /** Nombre de lignes indexées (0 = jointure impossible, base sans réf ni EAN). */
  size: number
  lookup: (p: SourceProduct) => { description: string | null; url: string | null; images: string[]; path: string[] }
}

const EMPTY: SourceExtrasIndex = {
  descriptionKey: null, urlKey: null, imageKeys: [], taxoKeys: [], taxoLabels: [], size: 0,
  lookup: () => ({ description: null, url: null, images: [], path: [] }),
}

function str(v: CellValue): string {
  return v == null ? '' : String(v).trim()
}

/** Réf normalisée pour la jointure : casse et séparateurs neutralisés. */
function refKey(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

const IMAGE_FILE_RX = /\.(png|jpe?g|webp|gif|avif)(\?|$)/i

/**
 * URLs d'images d'une cellule — une cellule peut en lister plusieurs (« a.jpg, b.jpg »).
 *
 * Beaucoup de catalogues ERP ne stockent que le NOM du fichier (« 2400956001.jpg ») :
 * l'URL publique se reconstitue avec un préfixe propre au client. Sans lui, ces colonnes
 * étaient silencieusement écartées et les vignettes restaient vides.
 */
function imageUrls(v: CellValue, prefix = ''): string[] {
  const s = str(v)
  if (!s) return []
  return s.split(/[,;\n|]/)
    .map((u) => u.trim())
    .filter(Boolean)
    .map((u) => (/^https?:\/\//.test(u) ? u : prefix ? prefix.replace(/\/+$/, '') + '/' + u.replace(/^\/+/, '') : ''))
    .filter(Boolean)
}

/** Colonnes d'images : type de champ déclaré, nom évocateur, ou valeurs qui en sont. */
function findImageKeys(columns: ExcelColumn[], rows: ExcelRow[]): string[] {
  const byMeta = columns.filter((c) => c.fieldType === 'image' || IMAGE_KEY_RX.test(c.key) || IMAGE_KEY_RX.test(c.label))
  if (byMeta.length > 0) return byMeta.map((c) => c.key)
  // Repli sur le CONTENU : une colonne dont les valeurs sont des noms de fichiers image
  // compte, même sans préfixe configuré — c'est justement le cas qu'on veut rattraper.
  const sample = rows.slice(0, 40)
  return columns
    .filter((c) => sample.some((r) => str(r[c.key]).split(/[,;\n|]/).some((u) => IMAGE_FILE_RX.test(u.trim()))))
    .map((c) => c.key)
}

/**
 * Colonne d'un niveau de taxonomie. Égalité stricte d'abord, puis inclusion : « Famille »
 * doit gagner sur « Sous-famille » quand les deux existent, alors qu'une inclusion nue
 * retiendrait la première rencontrée.
 */
function findTaxoKeys(columns: ExcelColumn[]): (string | null)[] {
  const folded = columns.map((c) => ({ key: c.key, forms: [foldHeader(c.key), foldHeader(c.label)] }))
  const taken = new Set<string>()
  return TAXO_LEVELS.map(({ aliases }) => {
    for (const exact of [true, false]) {
      for (const a of aliases) {
        const hit = folded.find((c) => !taken.has(c.key)
          && c.forms.some((f) => (exact ? f === a : f.includes(a))))
        if (hit) { taken.add(hit.key); return hit.key }
      }
    }
    return null
  })
}

/**
 * Chemin taxonomique d'une ligne PIM — même règle que `taxoPathOf` du catalogue persisté :
 * on démarre au premier niveau RENSEIGNÉ (un UNIVERS absent de cette base ne doit pas
 * renvoyer la ligne en « non classé ») et on s'arrête au premier trou ensuite — « Famille >
 * (vide) > Groupe » créerait un nœud fantôme regroupant des produits sans rapport.
 */
function taxoPath(row: ExcelRow, keys: (string | null)[]): string[] {
  const out: string[] = []
  for (const key of keys) {
    const v = key ? str(row[key]) : ''
    if (!v) { if (out.length > 0) break; continue }
    out.push(v)
  }
  return out
}

/**
 * Indexe une feuille PIM par référence ET par EAN. Les deux clés pointent la même ligne :
 * un produit source dont la réf n'est pas dans la base peut être retrouvé par son EAN.
 */
export function buildSourceExtras(
  columns: ExcelColumn[],
  rows: ExcelRow[],
  configured: { ref?: string; ean?: string; description?: string; imagePrefix?: string } = {},
): SourceExtrasIndex {
  if (rows.length === 0) return EMPTY
  const cols = columns.map((c) => ({ key: c.key, label: c.label }))
  const resolved = resolveCompareColumns(cols, {
    ref: configured.ref ?? '', ean: configured.ean ?? '', description: configured.description ?? '',
  })
  const refKeyCol = resolved.columns.ref
  const eanKeyCol = resolved.columns.ean
  const descKey = resolved.columns.description ?? null
  // Devinée par `resolveCompareColumns` (alias « url », « lienproduit », « permalink »…),
  // exactement comme le fait le node « Comparer catalogue » sur la même feuille.
  const urlKey = resolved.columns.url ?? null
  const imageKeys = findImageKeys(columns, rows)
  const taxoKeys = findTaxoKeys(columns)
  const taxoLabels = TAXO_LEVELS.filter((_, i) => taxoKeys[i]).map((l) => l.label)
  if (!refKeyCol && !eanKeyCol) return { ...EMPTY, descriptionKey: descKey, urlKey, imageKeys, taxoKeys, taxoLabels }

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
    // Seule une adresse absolue est un lien : une cellule qui porte une référence ou un
    // chemin relatif produirait un lien mort, plus trompeur qu'un libellé non cliquable.
    url: urlKey ? (/^https?:\/\//i.test(str(row[urlKey])) ? str(row[urlKey]) : null) : null,
    images: imageKeys.flatMap((k) => imageUrls(row[k], configured.imagePrefix)).slice(0, 6),
    path: taxoPath(row, taxoKeys),
  })

  return {
    descriptionKey: descKey,
    urlKey,
    imageKeys,
    taxoKeys,
    taxoLabels,
    size: Math.max(byRef.size, byEan.size),
    lookup: (p) => {
      const ean = normalizeEan(p.ean)
      const row = (ean && byEan.get(ean))
        || (p.ref && byRef.get(refKey(p.ref)))
        || (p.ref2 && byRef.get(refKey(p.ref2)))
      return row ? extract(row) : { description: null, url: null, images: [], path: [] }
    },
  }
}
