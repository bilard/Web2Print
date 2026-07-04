import { getRowValue } from '@/features/merge/mergeEngine'
import type { MergeColumn, MergeRow } from '@/stores/merge.store'
import type { PromoFields, PromoFieldKey, CustomFieldMap } from './promoTypes'
import { parsePrice, computeMechanism } from './priceParse'

/** Indices de devinage : libellés/aliases (en minuscules) qui pointent vers chaque champ promo. */
const GUESS: Partial<Record<PromoFieldKey, string[]>> = {
  name: ['nom', 'name', 'libelle', 'libellé', 'désignation', 'designation', 'ai_name'],
  image: ['image (dam)', 'image(dam)', 'image_dam', 'image dam', 'images', 'image', 'photo', 'visuel', 'ai_images'],
  brand: ['marque', 'brand', 'ai_brand'],
  ref: ['référence', 'reference', 'ref', 'sku', 'code article', 'code_article', 'code produit', 'code_produit', 'n° article', 'numéro article', 'item code', 'ai_distributor_ref'],
  ean: ['ean', 'gencod', 'code-barres', 'barcode', 'ai_ean'],
  oldPrice: ['prix_barré', 'prix_barre', 'prix barré', 'prix barre', 'prix_normal', 'prix normal', 'ancien prix', 'prix public', 'prix conseillé', 'prix conseille', 'prix de référence', 'prix catalogue', 'pvc', 'msrp', 'original', 'old price'],
  newPrice: ['prix_promo', 'prix promo', 'prix_net', 'prix_ttc', 'prix de vente', 'prix vente', 'prix_normal', 'prix normal', 'prix', 'tarif', 'price', 'pricing', 'ai_pricing'],
  unit: ['unité de vente', 'unite de vente', 'unité', 'unite', 'unit', 'conditionnement', 'colisage', 'vendu par', 'uv'],
  description: ['description', 'desc', 'descriptif', 'détail', 'detail', 'caractéristiques'],
  category: ['famille', 'univers', 'sous-famille', 'sous famille', 'catégorie', 'categorie', 'category', 'rayon'],
  unitPrice: ['unit_price', 'prix unitaire', 'prix au litre', 'prix/kg', 'prix au kg'],
  // Colonnes TEXTE (« Prix choc », « Top affaire ») d'abord : quand un dataset a
  // à la fois Mechanic (accroche) et Promotion (ratio %), le cartouche doit
  // porter l'accroche — la remise chiffrée reste calculable par les prix.
  promoLabel: ['mechanic', 'mécanique', 'mecanique', 'texte promotionnel', 'texte promo', 'accroche', 'top affaire', 'bon plan', 'promotion', 'offre', 'promo', 'badge'],
  validFrom: ['du', 'date début', 'valid from', 'valid_from'],
  validTo: ['au', 'date fin', "jusqu'au", 'valid until', 'valid_to'],
  mentions: ['mentions', 'mention légale', 'legal'],
  enseigne: ['enseigne', 'magasin', 'store'],
}

function matchColumn(columns: MergeColumn[], needles: string[]): string | undefined {
  const norm = (s: string) => s.toLowerCase().trim()
  for (const n of needles) {
    const hit = columns.find(
      (c) => norm(c.label) === n || norm(c.key) === n || (c.aliases ?? []).some((a) => norm(a) === n),
    )
    if (hit) return hit.key
  }
  // repli : inclusion partielle sur le label
  for (const n of needles) {
    const hit = columns.find((c) => norm(c.label).includes(n))
    if (hit) return hit.key
  }
  return undefined
}

export function defaultPromoFieldMap(columns: MergeColumn[]): Partial<Record<PromoFieldKey, string>> {
  const map: Partial<Record<PromoFieldKey, string>> = {}
  for (const [field, needles] of Object.entries(GUESS) as [PromoFieldKey, string[]][]) {
    const key = matchColumn(columns, needles)
    if (key) map[field] = key
  }
  // Garde : prix barré et prix de vente ne doivent JAMAIS pointer la même colonne
  // (repli partiel « prix » possible) — sinon prix affiché = prix barré et la
  // remise ne s'affiche jamais. On sacrifie le barré, le prix de vente prime.
  if (map.oldPrice && map.oldPrice === map.newPrice) delete map.oldPrice
  return map
}

function str(row: MergeRow, columns: MergeColumn[], key?: string): string {
  if (!key) return ''
  const v = getRowValue(row, key, columns)
  return v == null ? '' : String(v)
}

function num(row: MergeRow, columns: MergeColumn[], key?: string): number | null {
  if (!key) return null
  return parsePrice(getRowValue(row, key, columns))
}

/** Formate la mécanique promo affichée : ratio 0.28 → « -28% », 28 → « -28% », sinon texte brut. */
export function formatPromoLabel(raw: string): string | undefined {
  const t = raw.trim()
  if (!t) return undefined
  const n = Number(t.replace(',', '.'))
  if (Number.isFinite(n)) {
    if (n > 0 && n < 1) return `-${Math.round(n * 100)}%`
    if (n >= 1 && n < 100) return `-${Math.round(n)}%`
  }
  return t
}

/**
 * Libellé de remise AFFICHÉ sur le badge : la colonne « Promotion » (promoLabel)
 * est prioritaire, sinon la remise calculée prix barré/promo. Source unique
 * partagée par l'aperçu (toCardData) ET les règles conditionnelles.
 */
export function computeRemiseLabel(f: PromoFields): string | undefined {
  return formatPromoLabel(f.promoLabel) || (f.remisePct != null ? `-${f.remisePct}%` : undefined)
}

/**
 * Magnitude numérique de la remise AFFICHÉE (pour la colonne synthétique
 * « Remise (%) » des règles). Dérive du libellé final (computeRemiseLabel) pour
 * garantir l'égalité avec ce que voit l'utilisateur, quelle que soit l'origine
 * (colonne « Promotion » ou calcul). `null` si le badge n'exprime pas un pourcentage.
 */
export function displayedRemisePct(f: PromoFields): number | null {
  const label = computeRemiseLabel(f)
  if (!label) return null
  const m = label.match(/-?(\d+(?:[.,]\d+)?)\s*%/)
  return m ? Number(m[1].replace(',', '.')) : null
}

export function extractPromoFields(
  row: MergeRow,
  columns: MergeColumn[],
  fieldMap: Partial<Record<PromoFieldKey, string>>,
  customFields: CustomFieldMap = [],
): PromoFields {
  // Chaîne d'images complète (« détourée | originale », multi-images scrapées) :
  // les résolveurs essaient chaque candidat dans l'ordre (repli si fichier supprimé).
  const imagesRaw = str(row, columns, fieldMap.image)
  const image = imagesRaw.trim() || null
  const oldPrice = num(row, columns, fieldMap.oldPrice)
  const newPrice = num(row, columns, fieldMap.newPrice)
  const lotQty = num(row, columns, fieldMap.lotQty)
  const lotOffert = num(row, columns, fieldMap.lotOffert)
  const lotPrice = num(row, columns, fieldMap.lotPrice)
  const { mechanism, remisePct, remiseMontant } = computeMechanism({ oldPrice, newPrice, lotQty, lotOffert, lotPrice })
  const extra: Record<string, string> = {}
  for (const cf of customFields) {
    const v = str(row, columns, cf.column).trim()
    if (v) extra[cf.id] = v
  }
  return {
    name: str(row, columns, fieldMap.name),
    image,
    brand: str(row, columns, fieldMap.brand),
    ref: str(row, columns, fieldMap.ref),
    ean: str(row, columns, fieldMap.ean),
    oldPrice, newPrice,
    currency: 'EUR',
    unit: str(row, columns, fieldMap.unit),
    description: str(row, columns, fieldMap.description),
    category: str(row, columns, fieldMap.category),
    unitPrice: str(row, columns, fieldMap.unitPrice),
    promoLabel: str(row, columns, fieldMap.promoLabel),
    mechanism, remisePct, remiseMontant,
    lotQty, lotOffert, lotPrice,
    validFrom: str(row, columns, fieldMap.validFrom) || null,
    validTo: str(row, columns, fieldMap.validTo) || null,
    mentions: str(row, columns, fieldMap.mentions),
    enseigne: str(row, columns, fieldMap.enseigne),
    badges: [],
    extra,
  }
}
