// Promotion des champs d'IDENTITÉ d'un produit (marque, référence, EAN) depuis
// les specs scrapées vers les champs dédiés, et construction de l'identité
// finale à partir des sources disponibles.
//
// Les sites exposent l'identité de façon inconsistante : tantôt en champ propre,
// tantôt noyée dans une spec « Référence fabricant », tantôt collée dans une
// méga-spec « Caractéristiques » qu'il faut redécouper (`splitMegaSpecValue`).
// Se tromper ici propage une mauvaise référence dans tout le PIM.
//
// Module pur : testé par `liftIdentity.test.ts` et `splitMegaSpecValue.test.ts`.
import type { EnrichedProduct } from './types'
import type { StructuredProductData } from '@/features/scraping/core/structuredData'

// noyés dans ai_specifications.

interface IdentityFields {
  /** name n'est jamais lifté depuis les specs (les chips ne contiennent pas
   *  un champ "Nom du produit" propre) — il est posé par `buildIdentity` à
   *  partir de JSON-LD ou du H1 markdown. Présent ici pour symétrie de
   *  signature avec la sortie de `buildIdentity`. */
  name?: string
  brand?: string
  model?: string
  distributorRef?: string
  manufacturerRef?: string
  ean?: string
}

const EAN_VALUE_RE = /^\d{8,14}$/
/** Dictionnaire de marques connues — utilisé pour détecter le pattern chip
 *  "BRAND : modèle" (ex: Rubix-like). Strict : on n'admet PAS un fallback regex
 *  sur les MAJUSCULES car ça nuke les specs avec name en CAPS comme TENSION,
 *  POIDS, PUISSANCE, DIAMETRE — risque de perdre des specs réelles. Ajouter
 *  ici les nouvelles marques si nécessaire. */
const KNOWN_BRAND_KEYWORDS = [
  // Outillage / bricolage
  'BOSCH', 'MAKITA', 'MILWAUKEE', 'DEWALT', 'STANLEY', 'HILTI', 'METABO',
  'FACOM', 'STIHL', 'HUSQVARNA', 'RYOBI', 'AEG', 'KARCHER', 'KÄRCHER',
  'FESTOOL', 'FEIN', 'PANASONIC', 'BLACKDECKER', 'KNIPEX', 'WERA',
  'STAHLWILLE', 'BETA', 'GEDORE', 'SAM', 'KS TOOLS', 'NOROTOS',
  // Sanitaire / plomberie
  'NICOLL', 'GEBERIT', 'GROHE', 'HANSGROHE',
  // Électroménager / multimédia
  'BOSCH SIEMENS', 'WHIRLPOOL', 'DYSON', 'PHILIPS', 'SAMSUNG', 'LG', 'SONY',
]

/** Pattern valeur de mesure (ex: "230 V", "6.8 kg", "1500 W") — utilisé pour
 *  REJETER une lift "BRAND: VALUE" qui ressemble à une spec technique. */
const MEASUREMENT_VALUE_RE = /^\d+([.,]\d+)?\s*[a-zàâéèêëîïôùûüç%°/]+\.?$/i

function looksLikeBrandKey(rawName: string): boolean {
  const trimmed = rawName.trim().replace(/^[*_\s]+|[*_\s]+$/g, '')
  if (!trimmed) return false
  return KNOWN_BRAND_KEYWORDS.some(b => b.toLowerCase() === trimmed.toLowerCase())
}

/**
 * Extrait les champs identité depuis les specs et retire les entrées liftées.
 * Le retrait évite la duplication "Marque" dans ai_specifications + ai_brand.
 *
 * Exporté pour tests unitaires uniquement.
 */
export function liftIdentityFromSpecs(specs: EnrichedProduct['specifications']): {
  identity: IdentityFields
  remaining: EnrichedProduct['specifications']
} {
  const identity: IdentityFields = {}
  const remaining: EnrichedProduct['specifications'] = []

  for (const spec of specs) {
    const cleanName = spec.name.trim().replace(/^[*_\s]+|[*_\s:]+$/g, '')
    const cleanValue = spec.value.trim()
    const lowerName = cleanName.toLowerCase()
    let lifted = false

    // EAN / GTIN / code-barres
    if (!identity.ean && /^(ean|gtin|code[\s-]?barre|barcode)$/i.test(cleanName) && EAN_VALUE_RE.test(cleanValue.replace(/\s/g, ''))) {
      identity.ean = cleanValue.replace(/\s/g, '')
      lifted = true
    }
    // Réf. distributeur (chip "RUBIX : ...")
    else if (!identity.distributorRef && /^(rubix|distributeur|distributor|code\s+commande|code\s+revendeur|sku\s+revendeur|r[eé]f\.?\s+(?:revendeur|distributeur))$/i.test(cleanName) && cleanValue.length >= 3 && cleanValue.length < 60) {
      identity.distributorRef = cleanValue
      lifted = true
    }
    // Réf. fabricant (chip "FABRICANT : ..." ou MPN)
    else if (!identity.manufacturerRef && /^(fabricant|manufacturer|mpn|model\s*(?:number|no\.?)?|r[eé]f(?:[eé]rence)?\s+fabricant|part\s*(?:number|n[°o]?))$/i.test(cleanName) && cleanValue.length >= 3 && cleanValue.length < 60) {
      identity.manufacturerRef = cleanValue
      lifted = true
    }
    // Marque (chip "BOSCH : GBH 5-40 DCE" → brand=Bosch, model="GBH 5-40 DCE")
    //                                ↑ key=brand            value=model
    // Garde-fou : la value ne doit PAS ressembler à une mesure ("230 V",
    // "6.8 kg") — sinon c'est probablement une spec technique mal labellée
    // qui passerait à travers le dictionnaire (très improbable mais sûr).
    else if (
      (!identity.brand || !identity.model)
      && looksLikeBrandKey(cleanName)
      && cleanValue.length >= 2
      && cleanValue.length < 80
      && !/[.!?\n]/.test(cleanValue)
      && !MEASUREMENT_VALUE_RE.test(cleanValue)
    ) {
      // Capitalisation propre : BOSCH → Bosch
      const brandTitle = cleanName.charAt(0).toUpperCase() + cleanName.slice(1).toLowerCase()
      if (!identity.brand) identity.brand = brandTitle
      if (!identity.model) identity.model = cleanValue
      lifted = true
    }
    // Marque générique (label = "Marque" / "Brand")
    else if (!identity.brand && /^(marque|brand|fabricant\s+(?:officiel|d['’]origine))$/i.test(cleanName) && cleanValue.length >= 2 && cleanValue.length < 50) {
      identity.brand = cleanValue
      lifted = true
    }
    // Modèle générique
    else if (!identity.model && /^(mod[eè]le|model|d[eé]signation)$/i.test(lowerName) && cleanValue.length >= 2 && cleanValue.length < 80) {
      identity.model = cleanValue
      lifted = true
    }

    if (!lifted) remaining.push(spec)
  }

  return { identity, remaining }
}

/**
 * Construit les champs identité d'un EnrichedProduct en consolidant :
 *   1. JSON-LD/microdata (priorité haute — donnée structurée fiable)
 *   2. Specs liftées (chips Rubix-style)
 *   3. Markdown H1 (fallback pour name)
 *   4. Données entrée utilisateur (title/brand/reference)
 * Retourne aussi les specs nettoyées (sans les entrées liftées).
 */
export function buildIdentity(args: {
  structured: StructuredProductData | null
  specs: EnrichedProduct['specifications']
  markdown: string | null
  inputTitle?: string
  inputBrand?: string
  inputReference?: string
}): { identity: IdentityFields; specs: EnrichedProduct['specifications'] } {
  const { structured, specs, markdown, inputTitle, inputBrand, inputReference } = args
  const { identity: lifted, remaining } = liftIdentityFromSpecs(specs)

  // JSON-LD prioritaire sur les specs liftées (donnée structurée plus fiable)
  const id: IdentityFields = {
    name: structured?.name?.trim() || lifted.name,
    brand: structured?.brand?.trim() || lifted.brand,
    model: structured?.sku?.trim() || lifted.model,
    distributorRef: lifted.distributorRef,
    manufacturerRef: structured?.mpn?.trim() || lifted.manufacturerRef,
    // gtin JSON-LD VALIDÉ (8-14 chiffres) : nombre de sites y recopient leur
    // sku interne (« gtin: 1084074 » à 7 chiffres, fixture Trafic) — un faux
    // EAN écraserait celui lifté des specs (widget Icecat, tableau EAN…).
    ean: (() => { const g = structured?.gtin?.trim(); return g && EAN_VALUE_RE.test(g) ? g : lifted.ean })(),
  }

  // Fallback name : H1 markdown puis input utilisateur
  if (!id.name) {
    const h1Match = markdown?.match(/^#\s+(.+)/m)
    if (h1Match) {
      const h1 = h1Match[1].replace(/\*\*/g, '').trim()
      if (h1.length >= 5 && h1.length < 250) id.name = h1
    }
  }
  if (!id.name && inputTitle && inputTitle.length >= 5) id.name = inputTitle

  // Fallback EAN : heading "Code EAN" / "EAN" / "GTIN" / "Code-barres" suivi
  // d'un code 8-14 chiffres dans les lignes suivantes (pattern fabricant —
  // Makita rend `## Code EAN` puis le code seul sur sa ligne).
  if (!id.ean && markdown) {
    const eanMatch = markdown.match(/^#{0,4}\s*(?:code[\s-]*)?(?:EAN|GTIN|code[\s-]barres?)\s*:?\s*\n+\s*(\d{8,14})\b/im)
      ?? markdown.match(/\b(?:EAN|GTIN)\s*:?\s+(\d{8,14})\b/i)
    if (eanMatch) id.ean = eanMatch[1]
  }

  // Fallback référence/modèle : token SKU dans le H1 ("DDA351RTJ - Perceuse…")
  // ou ligne isolée SKU-like juste après un H1 (lettres majuscules + chiffres).
  if (!id.model && markdown) {
    const SKU_RE = /^[A-Z][A-Z0-9][A-Z0-9./-]{2,18}$/
    const hasDigit = (s: string) => /\d/.test(s)
    const h1 = markdown.match(/^#\s+(.+)/m)?.[1]?.trim()
    const h1Lead = h1?.split(/\s+[-–—]\s+/)[0]?.trim()
    if (h1Lead && SKU_RE.test(h1Lead) && hasDigit(h1Lead)) {
      id.model = h1Lead
    } else {
      // Scanner les ~8 lignes non vides qui suivent chaque H1
      const lines = markdown.split('\n')
      outer: for (let i = 0; i < lines.length; i++) {
        if (!/^#\s+/.test(lines[i])) continue
        let scanned = 0
        for (let j = i + 1; j < lines.length && scanned < 8; j++) {
          const t = lines[j].trim()
          if (!t) continue
          scanned++
          if (SKU_RE.test(t) && hasDigit(t)) { id.model = t; break outer }
        }
      }
    }
  }

  // Fallback brand : input utilisateur
  if (!id.brand && inputBrand && inputBrand.length >= 2) id.brand = inputBrand

  // Fallback manufacturerRef : input reference si fournie (souvent c'est la
  // ref fabricant que l'utilisateur passe, pas la ref distributeur).
  if (!id.manufacturerRef && inputReference && inputReference.length >= 3 && inputReference.length < 60) {
    id.manufacturerRef = inputReference
  }

  // Nettoyer les valeurs vides
  const cleaned: IdentityFields = {}
  if (id.name) cleaned.name = id.name
  if (id.brand) cleaned.brand = id.brand
  if (id.model) cleaned.model = id.model
  if (id.distributorRef) cleaned.distributorRef = id.distributorRef
  if (id.manufacturerRef) cleaned.manufacturerRef = id.manufacturerRef
  if (id.ean) cleaned.ean = id.ean

  return { identity: cleaned, specs: remaining }
}

/** Nettoie un EnrichedProduct en retirant les contenus parasites */
/** Blocs sentinelles internes (images/téléchargements injectés dans le markdown
 *  pour l'extraction déterministe) : à retirer de TOUT contenu envoyé au LLM —
 *  sinon le modèle les recrache dans les specs/description (constaté Castorama :
 *  spec « Caractéristiques » terminée par « JINA_EXTRACTED_IMAGES_START »). */
export function stripInternalSentinels(md: string): string {
  return md
    .replace(/JINA_EXTRACTED_(?:IMAGES|DOWNLOADS)_START[\s\S]*?(?:JINA_EXTRACTED_(?:IMAGES|DOWNLOADS)_END|$)/g, '')
    .trim()
}

/** Nom de spec « fourre-tout » : le LLM a mis TOUTE la table dans une seule valeur. */
export const MEGA_SPEC_NAME_RE = /^(caract[eé]ristiques?|sp[eé]cifications?(\s+techniques?)?|d[eé]tails?(\s+du\s+produit)?|informations?(\s+sur\s+le\s+produit)?)$/i

/**
 * Re-découpe une méga-valeur « Clé: Valeur Clé: Valeur … » (LLM qui concatène
 * la table de specs en une seule paire) en paires individuelles. Déterministe :
 * les clés sont détectées par le motif « Mot(s) capitalisé(s) court(s) + ": " ».
 * Renvoie [] si moins de 3 clés détectées (la valeur n'est pas une table).
 */
export function splitMegaSpecValue(value: string): Array<{ name: string; value: string }> {
  const re = /(?:^|\s)([A-ZÀ-Ÿ][A-Za-zÀ-ÿ'’()%/°\d .-]{1,40}?):\s+/g
  const keys: Array<{ name: string; start: number; valStart: number }> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(value)) !== null) {
    keys.push({ name: m[1].trim(), start: m.index, valStart: m.index + m[0].length })
  }
  if (keys.length < 3) return []
  const out: Array<{ name: string; value: string }> = []
  for (let i = 0; i < keys.length; i++) {
    const raw = value.slice(keys[i].valStart, i + 1 < keys.length ? keys[i + 1].start : undefined)
    const v = raw.replace(/©.*$/s, '').replace(/JINA_EXTRACTED_[\s\S]*$/, '').trim()
    if (v && !/^©/.test(keys[i].name)) out.push({ name: keys[i].name, value: v })
  }
  return out
}
