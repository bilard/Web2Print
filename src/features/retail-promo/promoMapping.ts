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
  url: ['url source', 'url produit', 'url', 'lien produit', 'lien', 'product url', 'link', 'page produit'],
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

/**
 * Colonnes « détails produit » usuelles du retail, reconnues comme champs libres
 * (zone « Détails » des fiches) — dans l'ordre d'affichage conventionnel.
 * Même philosophie que GUESS : source unique, étendre ICI (cf. skill
 * retail-card-conventions), jamais de dictionnaire local par module.
 */
const DETAIL_GUESS: string[][] = [
  ['avantages', 'avantage', 'bénéfices', 'benefits', 'atouts', 'points forts'],
  ['applications', 'application', 'usages', 'usage', 'utilisations', 'utilisation'],
  // Spécifications techniques scrapées (ai_specifications, aplaties « [Groupe]Nom: Valeur | … ») —
  // rendues en lignes « Nom : Valeur » plafonnées (cf. specLines). PAS de needle
  // « caractéristiques » nu : il sert déjà d'alias de description.
  ['spécifications', 'specifications', 'specs', 'spécifications techniques', 'caractéristiques techniques'],
  ['installation', 'montage', 'pose'],
  ['entretien', 'maintenance'],
  ['garantie', 'warranty'],
  ['matière', 'matiere', 'matériau', 'materiau', 'material'],
  ['dimensions', 'dimension'],
  ['poids', 'weight'],
  ['composition'],
  ['coloris', 'couleur', 'couleurs'],
  ['normes', 'norme', 'certifications', 'certification'],
  ['tva'],
]

/**
 * Devine les champs libres depuis les colonnes non mappées : chaque colonne
 * reconnue par DETAIL_GUESS devient une ligne « Étiquette : valeur » de la zone
 * Détails. Pendant du devinage `defaultPromoFieldMap` — sans lui, seuls les
 * champs ajoutés à la main s'affichaient et les colonnes riches (Avantages,
 * Applications…) restaient invisibles sur les fiches.
 */
export function defaultCustomFields(
  columns: MergeColumn[],
  fieldMap: Partial<Record<PromoFieldKey, string>>,
): CustomFieldMap {
  const used = new Set(Object.values(fieldMap))
  const takenIds = new Set<string>()
  const out: CustomFieldMap = []
  for (const needles of DETAIL_GUESS) {
    const free = columns.filter((c) => !used.has(c.key) && !out.some((cf) => cf.column === c.key))
    const key = matchColumn(free, needles)
    if (!key) continue
    const label = (columns.find((c) => c.key === key)?.label || key).trim()
    const base = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'champ'
    let id = base
    for (let i = 2; takenIds.has(id); i++) id = `${base}-${i}`
    takenIds.add(id)
    out.push({ id, label, column: key })
  }
  return out
}

function str(row: MergeRow, columns: MergeColumn[], key?: string): string {
  if (!key) return ''
  const v = getRowValue(row, key, columns)
  return v == null ? '' : String(v)
}

/**
 * Texte d'une cellule potentiellement STRUCTURÉE (source PIM verbatim) : les specs
 * [{group, name, value}] sont aplaties au même format que l'enrichissement
 * (« [Groupe]Nom: Valeur | … ») au lieu de sortir en « [object Object] ».
 */
function cellText(v: unknown): string {
  if (v == null) return ''
  if (Array.isArray(v)) {
    return v
      .map((it) => {
        if (it && typeof it === 'object') {
          const o = it as { group?: string; name?: string; value?: unknown }
          if (o.name !== undefined) return `${o.group ? `[${o.group}]` : ''}${o.name}: ${o.value ?? ''}`
          return JSON.stringify(it)
        }
        return String(it)
      })
      .filter(Boolean)
      .join(' | ')
  }
  return String(v)
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
    const v = cellText(getRowValue(row, cf.column, columns)).trim()
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
    url: /^https?:\/\//.test(str(row, columns, fieldMap.url).trim()) ? str(row, columns, fieldMap.url).trim() : undefined,
    extra,
  }
}

/**
 * Lignes « Étiquette : valeur » des champs libres pour la zone « Détails » d'une
 * fiche (étiquette = label saisi, sinon nom de colonne — pour que « 20 » ait un
 * sens ; dédupliquées). Source UNIQUE partagée par le rendu des pages ET l'aperçu
 * du style, sinon l'aperçu et le catalogue divergent.
 * `hidden` = ids de champs masqués individuellement (« Éléments affichés »).
 */
/** Une fiche n'est pas une fiche technique : plafond PAR DÉFAUT des specs affichées (réglable par fiche via cardStyle.maxSpecLines). */
export const MAX_SPEC_LINES = 6
const SPEC_FIELD_RE = /sp[ée]c|caract[ée]ristiques techniques/i

/** Ce champ libre est-il la colonne de spécifications techniques ? (UI du plafond). */
export function isSpecsDetailField(cf: { label?: string; column?: string }): boolean {
  return SPEC_FIELD_RE.test(`${cf.label ?? ''} ${cf.column ?? ''}`)
}

/** Une valeur de specs est-elle ÉCLATABLE en paires nom/valeur ? (« a: x | b: y » ou une paire par ligne). */
function isSpecShaped(v: string): boolean {
  return v.includes(':') && /\s\|\s|\n/.test(v)
}

export interface SpecTable {
  label: string
  rows: { name: string; value: string }[]
}

/**
 * TABLEAU des spécifications techniques d'une fiche : paires nom/valeur du champ
 * specs (formats « [Groupe]Nom: Valeur | … » et « une paire par ligne »),
 * plafonnées (`maxSpecLines`, 0 = masqué). Rendu en <table> par la carte —
 * null si aucun champ specs exploitable.
 */
export function buildSpecTable(
  customFields: CustomFieldMap,
  fields: PromoFields,
  hidden?: string[],
  maxSpecLines?: number,
): SpecTable | null {
  const max = Math.max(0, maxSpecLines ?? MAX_SPEC_LINES)
  if (max === 0) return null
  for (const cf of customFields) {
    if (hidden?.includes(cf.id) || !isSpecsDetailField(cf)) continue
    const v = fields.extra?.[cf.id]
    if (!v || !isSpecShaped(v)) continue
    const rows = v.split(/\s\|\s|\n+/)
      .map((s) => s.replace(/^\[[^\]]*\]\s*/, '').trim())
      .filter(Boolean)
      .map((s) => {
        const i = s.indexOf(':')
        return i > 0
          ? { name: s.slice(0, i).trim(), value: s.slice(i + 1).trim() }
          : { name: s, value: '' }
      })
      // Une « valeur » de plusieurs dizaines de caractères est de la PROSE
      // (« Usage : Idéal pour les usages quotidiens… »), pas une spec — en chip
      // elle wrappe sur 6 lignes et creuse des VIDES dans toute la rangée.
      .filter((r) => r.value.length <= 60)
      .slice(0, max)
    if (rows.length) return { label: (cf.label || cf.column || '').trim(), rows }
  }
  return null
}

/** Fiche promo ≠ argumentaire complet : plafond de puces par champ (réglable via cardStyle.maxBulletLines), longueur max d'une puce. */
export const MAX_BULLET_ITEMS = 5
const MAX_BULLET_CHARS = 160

/** Abrège au mot (« … » visible) — même philosophie que la description des fiches. */
function abridgeItem(s: string): string {
  if (s.length <= MAX_BULLET_CHARS) return s
  return `${s.slice(0, MAX_BULLET_CHARS).replace(/\s+\S*$/, '')}…`
}

/**
 * Valeur MULTI-SUJETS (liste à tirets/puces « - A - B », ou une phrase par
 * ligne — sortie IA/scraping) → étiquette en tête puis une PUCE par sujet,
 * PLAFONNÉES (4 puces, ~160 c chacune) : sans plafond, un champ verbeux (FAQ
 * scrapée…) remplit la boîte Détails et fait rogner les specs en dessous.
 * Les tirets INTERNES des mots composés (Anti-corrosion) sont préservés.
 * Mono-sujet : ligne « Étiquette : valeur » classique.
 */
function bulletLines(label: string, v: string, maxItems: number): string[] {
  const t = v.trim()
  const items = (/^[-–—•*]\s/.test(t)
    ? t.replace(/^[-–—•*]\s+/, '').split(/\s+[-–—•*]\s+/)
    : t.split(/\n+/)
  ).flatMap((s) => s.split(/\n+/))
    .map((s) => s.trim().replace(/^[-–—•*]\s+/, ''))
    .filter(Boolean)
    // Une « puce » qui finit par « : » est un TITRE de sous-section aspiré
    // (« Equipement standard : ») — elle consommait le quota pour rien.
    .filter((s) => !/:\s*$/.test(s))
  if (items.length < 2) return [label ? `${label} : ${abridgeItem(items[0] ?? t)}` : abridgeItem(items[0] ?? t)]
  return [...(label ? [`${label} :`] : []), ...items.slice(0, Math.max(1, maxItems)).map((s) => `• ${abridgeItem(s)}`)]
}

export function buildDetailLines(
  customFields: CustomFieldMap,
  fields: PromoFields,
  hidden?: string[],
  maxBulletItems?: number,
): string[] {
  return [...new Set(customFields
    .filter((cf) => !hidden?.includes(cf.id))
    .flatMap((cf) => {
      const v = fields.extra?.[cf.id]
      if (!v || !v.trim()) return []
      const lab = (cf.label || cf.column || '').trim()
      // Champ de spécifications éclatable : rendu à part en TABLEAU nom/valeur
      // (buildSpecTable) — jamais en lignes de texte.
      if (isSpecsDetailField(cf) && isSpecShaped(v)) return []
      return bulletLines(lab, v, maxBulletItems ?? MAX_BULLET_ITEMS)
    })
    .filter((v): v is string => !!v))]
}
