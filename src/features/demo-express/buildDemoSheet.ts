// src/features/demo-express/buildDemoSheet.ts
// Construction déterministe de la feuille PIM « Démo {Société} » depuis les
// produits enrichis : colonnes conventionnelles (devinables par promoMapping et
// guessLevelKeys), breadcrumb expansé en 3 niveaux de taxonomie, taxonomie de
// feuille dérivée via buildTaxonomyFromLevels.
import type { ExcelSheet, ExcelColumn, ExcelRow, FieldTypeId, TaxonomyLevelMap } from '@/features/excel/types'
import { buildTaxonomyFromLevels } from '@/features/excel/taxonomyBuilder'
import type { MergeColumn, MergeRow } from '@/stores/merge.store'
import type { EnrichRowAsset } from '@/features/excel/ai-enrichment/enrichRow'
import { isSaneSpecPair } from '@/features/scraping/core/parsers/parseSpecifications'

/** Champs demandés au moteur d'enrichissement (clés de mapProductToFields). */
export const DEMO_TARGET_FIELDS = [
  'name', 'subtitle', 'brand', 'reference', 'ean', 'price',
  'description', 'advantages', 'specifications', 'documents', 'breadcrumb',
]

export interface DemoProduct {
  url: string
  fields: Record<string, unknown>
  assets: EnrichRowAsset[]
  /** webViewLink Drive après upload DAM ; sinon repli sur la 1re image externe. */
  damLink?: string
}

/**
 * Une page enrichie est-elle une FICHE PRODUIT — et pas une page ÉDITORIALE
 * (rubrique, jeu concours, politique de confidentialité, landing métier)
 * remontée par la découverte ? Signal GÉNÉRIQUE (jamais par-vendeur), et
 * STRICT : les pages parasites savent produire un « prix » (lot d'un jeu
 * concours : 17 900 €) ou des pseudo-paires (formulaire métier) — seule une
 * IDENTITÉ produit (référence ou EAN) suffit seule ; sinon il faut prix ET
 * un vrai tableau de specs (≥ 3 paires passant la batterie de sanité).
 */
export function isProductLike(fields: Record<string, unknown>): boolean {
  const has = (k: string) => {
    const v = fields[k]
    return v != null && String(v).trim() !== ''
  }
  if (has('reference') || has('ean')) return true
  const specPairs = String(fields.specifications ?? '')
    .split(/\n+|\s\|\s/)
    .map((s) => {
      const i = s.indexOf(':')
      return i > 0 ? ([s.slice(0, i).trim(), s.slice(i + 1).trim()] as const) : null
    })
    .filter((p): p is readonly [string, string] => !!p && isSaneSpecPair(p[0], p[1])).length
  return has('price') && specPairs >= 3
}

const col = (key: string, label: string, fieldType: FieldTypeId, opts: Partial<ExcelColumn> = {}): ExcelColumn => ({
  key, label, fieldType, detectedType: fieldType, isPrimary: false, width: 180, ...opts,
})

const str = (v: unknown): string => (v == null ? '' : String(v).trim())

/** « 1 234,56 € » / « 1234.56 » → nombre, sinon texte brut (affichable quand même). */
function toPrice(v: unknown): string | number | null {
  const s = str(v)
  if (!s) return null
  const n = parseFloat(s.replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : s
}

/** Niveaux de taxonomie depuis le breadcrumb : retire « Accueil »/« Home » en tête
 *  et le nom du produit en queue (le fil d'Ariane se termine souvent par lui). */
function breadcrumbLevels(breadcrumb: string, name: string): string[] {
  const parts = breadcrumb.split('>').map((s) => s.trim()).filter(Boolean)
  const cleaned = parts.filter((p, i) => !(i === 0 && /^(accueil|home)$/i.test(p)))
  if (cleaned.length && name && cleaned[cleaned.length - 1].toLowerCase() === name.toLowerCase()) cleaned.pop()
  return cleaned.slice(0, 3)
}

export function buildDemoSheet(company: string, siteUrl: string, items: DemoProduct[]): ExcelSheet {
  const columns: ExcelColumn[] = [
    col('name', 'Nom', 'text', { isPrimary: true, width: 240 }),
    col('subtitle', 'Sous-titre', 'text', { width: 200 }),
    col('brand', 'Marque', 'text', { width: 130 }),
    col('reference', 'Référence', 'text', { width: 140 }),
    col('ean', 'EAN', 'text', { width: 140 }),
    col('price', 'Prix', 'currency', { width: 110 }),
    col('image', 'Image (DAM)', 'image', { width: 260 }),
    col('taxonomie_n1', 'Univers', 'text', { width: 150 }),
    col('taxonomie_n2', 'Famille', 'text', { width: 150 }),
    col('taxonomie_n3', 'Sous-famille', 'text', { width: 150 }),
    col('description', 'Description', 'text_long', { width: 320 }),
    col('advantages', 'Avantages', 'text_long', { width: 280 }),
    col('specifications', 'Caractéristiques', 'text_long', { width: 320 }),
    col('documents', 'Documents', 'url', { width: 220 }),
    col('url', 'URL source', 'url', { width: 220 }),
  ]

  const rows: ExcelRow[] = items.map((it, i) => {
    const f = it.fields
    const name = str(f.name)
    const levels = breadcrumbLevels(str(f.breadcrumb), name)
    const firstImage = it.assets.find((a) => a.type === 'image')?.url ?? null
    return {
      _id: `demo_${i}_${Math.random().toString(36).slice(2, 8)}`,
      name: name || `Produit ${i + 1}`,
      subtitle: str(f.subtitle) || null,
      // Marque toujours renseignée : repli sur la société du prospect (« Milwaukee »)
      // — les pages fabricant n'affichent pas leur propre marque en donnée.
      brand: str(f.brand) || company,
      reference: str(f.reference) || null,
      ean: str(f.ean) || null,
      price: toPrice(f.price),
      image: it.damLink ?? firstImage,
      taxonomie_n1: levels[0] ?? null,
      taxonomie_n2: levels[1] ?? null,
      taxonomie_n3: levels[2] ?? null,
      description: str(f.description) || null,
      advantages: str(f.advantages) || null,
      specifications: str(f.specifications) || null,
      documents: str(f.documents) || null,
      url: it.url,
    }
  })

  const levelMap: TaxonomyLevelMap = { taxonomie_n1: 1, taxonomie_n2: 2, taxonomie_n3: 3 }
  const sheet: ExcelSheet = {
    name: `Démo ${company}`,
    columns,
    rows,
    taxonomy: [],
    taxonomyLevels: levelMap,
    sourceUrl: siteUrl,
  }
  sheet.taxonomy = buildTaxonomyFromLevels(sheet, levelMap)
  return sheet
}

/** Projette la feuille au format du moteur de merge (catalogue + promo). */
export function sheetToMerge(sheet: ExcelSheet): { columns: MergeColumn[]; rows: MergeRow[] } {
  return {
    columns: sheet.columns.map((c) => ({ key: c.key, label: c.label, fieldType: c.fieldType })),
    rows: sheet.rows.map((r) => ({ ...r })),
  }
}
