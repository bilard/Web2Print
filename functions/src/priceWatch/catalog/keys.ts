// src/features/priceWatch/catalog/keys.ts
// Clés de jointure entre le catalogue source et un catalogue concurrent. PUR.
//
// Constat terrain (motoculture, 5 concurrents PrestaShop) : CHAQUE site expose une
// clé différente — réf interne du distributeur (webmotoculture), réf constructeur
// brute (jardimax), réf constructeur sans séparateurs (emc), EAN en gtin13
// (pro-motoculture). Aucune n'est universelle, et l'EAN encore moins que les autres :
// certains sites émettent leurs PROPRES codes-barres internes en gtin13 (préfixes
// 20-29, à usage interne GS1) — les joindre à l'aveugle produit des faux.
//
// Conséquence de conception : on n'a PAS de table clé→site (cf. « pas de scrapers par
// fournisseur »). On essaie toutes les clés candidates et on ne retient QUE celle qui
// valide par ÉGALITÉ EXACTE normalisée, jamais « premier résultat », jamais un LLM
// juge. Sur un catalogue de pièces, un trou vaut mieux qu'un faux prix : une fausse
// correspondance déclenche une alerte de positionnement erronée.

/** Longueur minimale d'une clé de référence exploitable. En dessous, le risque de
 *  collision fortuite dépasse la valeur du match. */
export const MIN_REF_LEN = 3

/** En dessous de ce seuil, une référence n'est acceptée que sur un champ d'identité
 *  déclaré (sku/mpn), jamais par présence dans un titre ou une URL : « A35 » se
 *  retrouverait dans « LA35 », « A350 », « CA35B »… */
export const WEAK_REF_LEN = 5

/**
 * Forme canonique d'une référence : majuscules, séparateurs retirés.
 * `112794117/0` → `1127941170`, `00.1857.40` → `00185740`, `bs-790287` → `BS790287`.
 */
export function normalizeRef(raw: string | null | undefined): string {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * Variante sans zéros de tête. Les ERP et les boutiques divergent sur le padding
 * (`0306030002` ↔ `306030002`), c'est une source de trous silencieux.
 * Ne s'applique pas si la référence n'est QUE des zéros.
 */
export function stripLeadingZeros(ref: string): string {
  const s = ref.replace(/^0+/, '')
  return s || ref
}

/**
 * Normalise un code-barres en GTIN-13. Retire les non-chiffres, ramène un GTIN-14
 * à 13 en ôtant le chiffre d'indice logistique de tête. '' si la longueur n'est pas
 * exploitable (on n'invente pas de clé d'appariement à partir d'un code tronqué).
 */
export function normalizeEan(raw: string | null | undefined): string {
  const d = String(raw ?? '').replace(/\D/g, '')
  if (d.length === 14 && d.startsWith('0')) return d.slice(1)
  if (d.length === 13 || d.length === 12 || d.length === 8) return d
  return ''
}

/**
 * Un gtin13 émis par la boutique elle-même, et non par le fabricant : préfixes GS1
 * 02 et 20-29 (usage interne / pesée variable), et 30xx observé chez webmotoculture.
 * Ces codes ne joignent RIEN entre deux enseignes — les traiter comme des EAN
 * apparie des produits sans rapport.
 */
export function isInternalBarcode(ean: string): boolean {
  const d = normalizeEan(ean)
  if (d.length !== 13) return false
  return /^(0?2|2\d|30)/.test(d.slice(0, 2))
}

/** Type de clé, du plus fiable au moins fiable. Sert à ordonner les tentatives et à
 *  tracer PAR QUOI un appariement a été obtenu (auditable dans le résultat). */
type JoinKeyKind = 'ean' | 'ref' | 'ref-nozero'

export interface JoinKey {
  kind: JoinKeyKind
  value: string
  /** Clé courte : n'autorise que l'égalité sur un champ d'identité déclaré. */
  weak: boolean
  /** Clé issue d'une référence d'ORIGINE (« Remplace origine: … »), pas du produit
   *  lui-même. Un match sur une telle clé compare une pièce adaptable à la pièce
   *  d'origine qu'elle remplace — utile, mais PAS le même produit. À signaler. */
  origin: boolean
}

export interface SourceProductKeys {
  /** Référence article principale (CODE_ARTICLE). */
  ref?: string
  /** Référence secondaire éventuelle (ARTICLECODE2). */
  ref2?: string
  ean?: string
  /** Références d'origine citées dans la description (« Remplace origine: … »). */
  originRefs?: string[]
}

/**
 * Clés candidates d'un produit source, ordonnées du plus fiable au moins fiable et
 * dédupliquées. L'EAN interne du distributeur est écarté ici même : il ne peut pas
 * servir de clé de jointure.
 */
export function candidateKeys(p: SourceProductKeys): JoinKey[] {
  const out: JoinKey[] = []
  const seen = new Set<string>()
  const push = (kind: JoinKeyKind, value: string, origin: boolean) => {
    if (!value) return
    const dedup = `${kind}:${value}`
    if (seen.has(dedup)) return
    seen.add(dedup)
    out.push({ kind, value, weak: kind !== 'ean' && value.length < WEAK_REF_LEN, origin })
  }

  const ean = normalizeEan(p.ean)
  if (ean && !isInternalBarcode(ean)) push('ean', ean, false)

  // Références propres du produit d'abord (origin=false), références d'origine ensuite
  // (origin=true) : un match exact prime toujours sur un match « pièce d'origine ».
  const ownRefs = [p.ref, p.ref2].filter(Boolean) as string[]
  const originRefs = (p.originRefs ?? [])
  for (const [raw, isOrigin] of [
    ...ownRefs.map((r) => [r, false] as const),
    ...originRefs.map((r) => [r, true] as const),
  ]) {
    const ref = normalizeRef(raw)
    if (ref.length < MIN_REF_LEN) continue
    push('ref', ref, isOrigin)
    const nz = stripLeadingZeros(ref)
    if (nz !== ref && nz.length >= MIN_REF_LEN) push('ref-nozero', nz, isOrigin)
  }
  return out
}

/** Identité relevée sur une page concurrent (liste ou fiche). Champs bruts. */
export interface CompetitorIdentity {
  /** `sku` / `itemprop=sku` / bloc « Référence : » — champ d'identité DÉCLARÉ. */
  sku?: string
  /** `mpn` JSON-LD — champ d'identité déclaré. */
  mpn?: string
  /** `gtin13` JSON-LD — peut être un code interne, filtré à la validation. */
  gtin13?: string
  /** URL de la fiche : certains sites y placent l'EAN (slug `…-4049582772185.html`). */
  url?: string
  /** Titre : certains sites y préfixent la référence (`5131028856 - Carburateur…`). */
  name?: string
}

type MatchEvidence = 'gtin13' | 'ean-in-url' | 'ref-in-url' | 'sku' | 'mpn' | 'ref-in-name'

/**
 * Références candidates extraites du SLUG d'une URL produit, l'ID PrestaShop retiré.
 * PrestaShop construit `/{catégorie}/{id}-{slug-descriptif}.html` ; le PREMIER token
 * numérique est l'identifiant interne du site (jamais une réf constructeur) — on le
 * retire pour ne pas apparier un produit à l'ID d'un autre. Les tokens restants d'au
 * On ne retient que les tokens PUREMENT numériques d'au moins WEAK_REF_LEN chiffres :
 * cela écarte d'un coup les mots (« lame », « stiga ») ET les cotes avec unité
 * (« 510mm », « 51cm »), sans logique d'unités à maintenir. Une réf constructeur dans
 * un slug PrestaShop est numérique dans la quasi-totalité des cas terrain.
 * `…/173085-lame-510mm-stiga-181004383-0.html` → ['181004383'] (173085 = id retiré,
 * 510mm = non numérique, 0 = trop court).
 */
export function refTokensFromUrl(url: string | null | undefined): string[] {
  const path = String(url ?? '').split(/[?#]/)[0]
  const last = path.split('/').filter(Boolean).pop() ?? ''
  const slug = last.replace(/\.html?$/i, '').replace(/^\d+-/, '')
  const out: string[] = []
  const seen = new Set<string>()
  for (const tok of slug.split(/[^0-9]+/)) {
    if (tok.length < WEAK_REF_LEN || seen.has(tok)) continue
    seen.add(tok)
    out.push(tok)
  }
  return out
}

export interface MatchProof {
  key: JoinKey
  evidence: MatchEvidence
}

/**
 * Premier segment d'un titre, normalisé. `5131028856 - Carburateur pour RYOBI`
 * → `5131028856`. On coupe sur les séparateurs de tête usuels et on s'arrête au
 * premier blanc : comparer la chaîne entière par préfixe validerait `12345` contre
 * un titre `123456 …`.
 */
function leadingToken(name: string | undefined): string {
  const first = String(name ?? '').trim().split(/[\s|/]+/)[0] ?? ''
  return normalizeRef(first)
}

/** Un champ d'identité déclaré porte-t-il exactement cette référence ? */
function refEqualsDeclared(key: JoinKey, id: CompetitorIdentity): MatchEvidence | null {
  for (const [field, evidence] of [['sku', 'sku'], ['mpn', 'mpn']] as const) {
    const raw = id[field]
    if (!raw) continue
    const norm = normalizeRef(raw)
    if (!norm) continue
    if (norm === key.value || stripLeadingZeros(norm) === key.value) return evidence
  }
  return null
}

/**
 * Un appariement est-il PROUVÉ entre un produit source et une identité concurrent ?
 * Renvoie la preuve, ou null. Aucune heuristique de similarité : uniquement des
 * égalités exactes sur formes normalisées.
 *
 * Le nom n'est JAMAIS une preuve à lui seul. Sur un catalogue de pièces, « BUSHING »,
 * « ROD-PUSH » ou « FILTRE A AIR » désignent des milliers d'articles distincts ;
 * un site testé a renvoyé un produit sur 6 requêtes sur 7 et jamais le bon.
 */
export function proveMatch(keys: JoinKey[], id: CompetitorIdentity): MatchProof | null {
  const gtin = normalizeEan(id.gtin13)
  const urlDigits = String(id.url ?? '').replace(/\D/g, '')
  const nameRef = leadingToken(id.name)

  for (const key of keys) {
    if (key.kind === 'ean') {
      // gtin13 déclaré : concluant, sauf code interne à la boutique.
      if (gtin && gtin === key.value && !isInternalBarcode(gtin)) return { key, evidence: 'gtin13' }
      // EAN dans le slug d'URL : 13 chiffres consécutifs ne sont pas fortuits.
      if (key.value.length === 13 && urlDigits.includes(key.value)) {
        return { key, evidence: 'ean-in-url' }
      }
      continue
    }
    const declared = refEqualsDeclared(key, id)
    if (declared) return { key, evidence: declared }
    // Référence en tête de titre : égalité du premier token seulement, et clé assez
    // longue pour ne pas se confondre avec un autre code (`A35` ⊂ `LA35`).
    if (!key.weak && nameRef && nameRef === key.value) return { key, evidence: 'ref-in-name' }
    // Référence dans le slug d'URL (autoportee : `…-181004383-0.html`) : token entier
    // du slug (ID PrestaShop retiré), clé forte uniquement. Comme `ref-in-name`, jamais
    // sur clé faible — un code de 5+ caractères délimité n'est pas fortuit.
    if (!key.weak) {
      for (const r of refTokensFromUrl(id.url)) {
        if (r === key.value || stripLeadingZeros(r) === key.value) return { key, evidence: 'ref-in-url' }
      }
    }
  }
  return null
}
