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

import { DEFAULT_PAIRING_RULES, type PairingRules, type MatchEvidence } from './pairingRules'

/** Nature de la preuve, de la plus concluante à la plus fragile. Déclarée dans
 *  `pairingRules.ts` — les règles doivent pouvoir nommer les preuves qu'elles autorisent,
 *  et ce module doit pouvoir lire les règles ; un seul sens d'import évite le cycle.
 *  Ré-exportée ici, où tout le reste du module la lit. */
export type { MatchEvidence }

/** Longueur minimale d'une clé de référence exploitable. En dessous, le risque de
 *  collision fortuite dépasse la valeur du match.
 *
 *  ⚠ Cette constante et la suivante restent la VALEUR DE RÉFÉRENCE : elles sont le défaut
 *  de `PairingRules` et le repli des appelants qui ne passent pas de règles. */
export const MIN_REF_LEN = 3

/** En dessous de ce seuil, une référence n'est acceptée que sur un champ d'identité
 *  déclaré (sku/mpn), jamais par présence dans un titre ou une URL : « A35 » se
 *  retrouverait dans « LA35 », « A350 », « CA35B »… */
const WEAK_REF_LEN = 5

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
  /** Référence TELLE QU'ÉCRITE dans le catalogue source, avant normalisation.
   *
   *  `value` a perdu ce qui distingue : « 122600092/0 » et « 160-8115 » y deviennent
   *  « 1226000920 » et « 1608115 », indiscernables d'un numéro quelconque. Or c'est
   *  précisément la FORME d'origine qui dit si la clé discrimine — une référence
   *  structurée appartient à son constructeur, une suite de chiffres nus n'appartient à
   *  personne (cf. `keyIsDistinctive` dans `match.ts`). */
  raw: string
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
export function candidateKeys(p: SourceProductKeys, rules: PairingRules = DEFAULT_PAIRING_RULES): JoinKey[] {
  const out: JoinKey[] = []
  const seen = new Set<string>()
  const push = (kind: JoinKeyKind, value: string, origin: boolean, raw: string) => {
    if (!value) return
    const dedup = `${kind}:${value}`
    if (seen.has(dedup)) return
    seen.add(dedup)
    out.push({ kind, value, weak: kind !== 'ean' && value.length < rules.weakRefLen, origin, raw })
  }

  const ean = normalizeEan(p.ean)
  if (ean && !isInternalBarcode(ean)) push('ean', ean, false, String(p.ean ?? ''))

  // Références propres du produit d'abord (origin=false), références d'origine ensuite
  // (origin=true) : un match exact prime toujours sur un match « pièce d'origine ».
  const ownRefs = [p.ref, p.ref2].filter(Boolean) as string[]
  const originRefs = rules.useOriginRefs ? (p.originRefs ?? []) : []
  for (const [raw, isOrigin] of [
    ...ownRefs.map((r) => [r, false] as const),
    ...originRefs.map((r) => [r, true] as const),
  ]) {
    const ref = normalizeRef(raw)
    if (ref.length < rules.minRefLen) continue
    push('ref', ref, isOrigin, raw)
    const nz = stripLeadingZeros(ref)
    if (nz !== ref && nz.length >= rules.minRefLen) push('ref-nozero', nz, isOrigin, raw)
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

/**
 * Cote dimensionnelle avec unité (`510MM`, `1000ML`, `12V`) — jamais une référence.
 * Sans ce filtre, chaque libellé de pièce émettrait des clés de jointure fantômes.
 */
const DIMENSION_WITH_UNIT = /^\d+(?:[.,]\d+)?(?:MM|CM|M|L|KG|G|ML|CC|CV|V|W|A|AH|MAH|PO|T|H)$/
/** Dimension `LxH` (`200X25`) : une cote, pas une référence — dans un TITRE seulement. */
const DIMENSION_PAIR = /^\d+X\d+$/

/**
 * Références candidates lues dans un TEXTE LIBRE (libellé produit d'un marchand).
 *
 * Constat terrain décisif : chez la moitié des concurrents relevés, la référence
 * constructeur n'est ni dans un champ déclaré (`sku`/`mpn`) ni en tête de titre — elle
 * est EN FIN de libellé (« Courroie tondeuse autoportée VIKING 6151-704-2110 »,
 * « Fusible VAPORMATIC VLC2208 »). Ne lire que le premier mot rend ces catalogues
 * entiers non joignables, alors que la référence y est écrite en clair.
 *
 * Chaque mot est testé entier (les séparateurs internes sont normalisés :
 * `6151-704-2110` → `61517042110`) PUIS redécoupé sur `/` et `,`, qui séparent des
 * références distinctes (« 5127500-00/6,5127500-80/8 »).
 *
 * Filtres — le risque ici est le FAUX POSITIF, pas le trou : un token doit contenir un
 * chiffre, faire au moins WEAK_REF_LEN caractères, et n'être ni une cote avec unité ni
 * une dimension `LxH`. Le second verrou est ailleurs : une clé issue d'un titre ne
 * prouve un appariement que si elle est forte (cf. `proveMatch`), et l'index écarte
 * celles qui désignent plusieurs produits (cf. `buildMemoryIndex`).
 */
export function refTokensFromText(text: string | null | undefined, minLen: number = WEAK_REF_LEN): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const word of String(text ?? '').split(/[\s|]+/)) {
    // Ponctuation de bord retirée ; celle de l'intérieur est traitée par normalizeRef.
    const cleaned = word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '')
    if (!cleaned) continue
    for (const part of [cleaned, ...cleaned.split(/[,/]/)]) {
      const norm = normalizeRef(part)
      if (norm.length < minLen || !/\d/.test(norm)) continue
      if (DIMENSION_WITH_UNIT.test(norm) || DIMENSION_PAIR.test(norm)) continue
      if (seen.has(norm)) continue
      seen.add(norm)
      out.push(norm)
    }
  }
  return out
}

/**
 * Références candidates extraites du SLUG d'une URL produit, l'ID PrestaShop retiré.
 * PrestaShop construit `/{catégorie}/{id}-{slug-descriptif}.html` ; le PREMIER token
 * numérique est l'identifiant interne du site (jamais une réf constructeur) — on le
 * retire pour ne pas apparier un produit à l'ID d'un autre.
 *
 * ⚠ DÉCOUPE SUR LES SÉPARATEURS, jamais sur « tout ce qui n'est pas un chiffre ». Cette
 * seconde règle DÉCHIQUETAIT les références alphanumériques et fabriquait des appariements
 * faux à la chaîne — trois cas relevés le même jour :
 *   `…-demarreur-kohler-4109806s.html`      → « 4109806 » appariait un FILTRE À AIR ;
 *   `…-demarreur-massey-6306847m91.html`    → « 6306847 » appariait un SERRE-CÂBLE ;
 *   `…-transmission-ggp-pl39005.html`       → « 39005 »   appariait une COURROIE.
 * Dans les trois cas, la vraie référence du marchand n'est PAS la nôtre : la nôtre n'en
 * est qu'un morceau. Un fragment découpé au milieu d'un code ne prouve rien.
 *
 * Un token n'est donc retenu que s'il est DÉLIMITÉ dans le slug, et alors :
 *   - purement numérique (le cas de très loin le plus fréquent en réf constructeur) ;
 *   - ou alphanumérique CONTENANT un chiffre (`PL39005`, `VLC2208`) — ce qui rend enfin
 *     joignables les catalogues à référence mixte, sans ouvrir la porte aux mots
 *     (« lame », « stiga ») qui n'en contiennent aucun.
 * Les cotes avec unité sont écartées comme dans `refTokensFromText` — même barrière, même
 * raison. `…/173085-lame-510mm-stiga-181004383-0.html` → ['181004383'] (173085 = id
 * retiré, 510MM = cote, stiga = sans chiffre, 0 = trop court).
 */
export function refTokensFromUrl(url: string | null | undefined, minLen: number = WEAK_REF_LEN): string[] {
  const path = String(url ?? '').split(/[?#]/)[0]
  const last = path.split('/').filter(Boolean).pop() ?? ''
  const slug = last.replace(/\.html?$/i, '').replace(/^\d+-/, '')
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of slug.split(/[^A-Za-z0-9]+/)) {
    const tok = raw.toUpperCase()
    if (tok.length < minLen || seen.has(tok)) continue
    if (!/\d/.test(tok)) continue
    if (DIMENSION_WITH_UNIT.test(tok) || DIMENSION_PAIR.test(tok)) continue
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

/**
 * Références lues dans un champ d'identité DÉCLARÉ (« Référence », `sku`, `mpn`).
 *
 * ⚠ Le champ n'en contient pas toujours UNE seule — c'est même le cas le plus courant sur
 * le terrain, mesuré chez trois concurrents du suivi :
 *   « 1134349606 - 1134-3496-06 »   deux écritures de la MÊME référence ;
 *   « MTD7540280 »                  la référence habillée de la marque ;
 *   « 5127500-00/6, 5127500-80/8 »  deux références distinctes, énumérées.
 * Normalisée d'un bloc, la première donnait « 11343496061134349606 » : une clé que rien ne
 * peut retrouver. Ces fiches n'étaient alors appariables que par raccroc — si l'URL ou le
 * titre portaient la référence.
 *
 * On découpe donc sur les séparateurs d'ÉNUMÉRATION et on dénude l'habit de marque quand
 * ce qui reste discrimine seul (six chiffres au moins). Rien n'est deviné pour autant :
 * chaque forme produite doit encore prouver l'appariement par égalité exacte.
 */
/** ⚠ Le nombre dénudé ne doit PAS commencer par un zéro. Sans cette borne, « KL060004 »
 *  rendait « 060004 », que le dépaddage ramenait ensuite à « 60004 » — soit DEUX
 *  transformations enchaînées, assez pour rencontrer n'importe quelle référence courte.
 *  Cas vécu : « LAME 479MM » (origine 60.00-4) appariée à un « Thermostat UNIVERSEL
 *  KL060004 », +551 % d'écart. Une clé qu'il faut retailler deux fois n'est pas une clé. */
const BRAND_DRESSED = /^[A-Z]+([1-9]\d{5,})$/

export function declaredRefTokens(raw: string | null | undefined, minLen: number = MIN_REF_LEN): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (v: string) => {
    if (v.length < minLen || seen.has(v)) return
    seen.add(v); out.push(v)
  }
  for (const part of String(raw ?? '').split(/[\s,;|]+/)) {
    const norm = normalizeRef(part)
    if (!norm) continue
    push(norm)
    // Déclinaison PrestaShop « 181004383/0 » : la partie avant la barre est la référence.
    const beforeSlash = normalizeRef(part.split('/')[0])
    if (beforeSlash) push(beforeSlash)
    const bare = BRAND_DRESSED.exec(norm)?.[1]
    if (bare) push(bare)
  }
  return out
}

/** Un champ d'identité déclaré porte-t-il exactement cette référence ? Chaque forme que
 *  le champ contient est essayée — déclinaison PrestaShop « 181004383/0 », énumération,
 *  habit de marque —, et l'égalité reste EXACTE sur chacune. */
function refEqualsDeclared(key: JoinKey, id: CompetitorIdentity, rules: PairingRules): MatchEvidence | null {
  for (const [field, evidence] of [['sku', 'sku'], ['mpn', 'mpn']] as const) {
    const raw = id[field]
    if (!raw || !rules.evidence[evidence]) continue
    // ⚠ CHAQUE forme portée par le champ, jamais la chaîne entière : un champ qui empile
    // deux écritures ou préfixe la marque ne prouvait RIEN (cf. `declaredRefTokens`).
    for (const norm of declaredRefTokens(raw, rules.minRefLen)) {
      if (norm === key.value || stripLeadingZeros(norm) === key.value) return evidence
    }
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
export function proveMatch(
  keys: JoinKey[],
  id: CompetitorIdentity,
  rules: PairingRules = DEFAULT_PAIRING_RULES,
): MatchProof | null {
  const gtin = normalizeEan(id.gtin13)
  const urlDigits = String(id.url ?? '').replace(/\D/g, '')
  const nameRef = leadingToken(id.name)
  // Une nature de preuve désactivée par le réglage n'est pas seulement dépriorisée : elle
  // ne peut plus rien prouver du tout. Couper `ref-in-title` (la plus fragile) supprime
  // du bruit ET des appariements — les deux sont voulus, c'est le sens du réglage.
  const on = (e: MatchEvidence) => rules.evidence[e]

  for (const key of keys) {
    if (key.kind === 'ean') {
      // gtin13 déclaré : concluant, sauf code interne à la boutique.
      if (on('gtin13') && gtin && gtin === key.value && !isInternalBarcode(gtin)) {
        return { key, evidence: 'gtin13' }
      }
      // EAN dans le slug d'URL : 13 chiffres consécutifs ne sont pas fortuits.
      if (on('ean-in-url') && key.value.length === 13 && urlDigits.includes(key.value)) {
        return { key, evidence: 'ean-in-url' }
      }
      continue
    }
    const declared = refEqualsDeclared(key, id, rules)
    if (declared) return { key, evidence: declared }
    // Référence en tête de titre : égalité du premier token seulement, et clé assez
    // longue pour ne pas se confondre avec un autre code (`A35` ⊂ `LA35`).
    if (on('ref-in-name') && !key.weak && nameRef && nameRef === key.value) {
      return { key, evidence: 'ref-in-name' }
    }
    // Référence dans le slug d'URL (autoportee : `…-181004383-0.html`) : token entier
    // du slug (ID PrestaShop retiré), clé forte uniquement. Comme `ref-in-name`, jamais
    // sur clé faible — un code de 5+ caractères délimité n'est pas fortuit.
    if (!key.weak) {
      if (on('ref-in-url')) {
        for (const r of refTokensFromUrl(id.url, rules.weakRefLen)) {
          if (r === key.value || stripLeadingZeros(r) === key.value) return { key, evidence: 'ref-in-url' }
        }
      }
      // Référence ailleurs dans le LIBELLÉ (« … VIKING 6151-704-2110 ») : égalité exacte
      // sur un mot entier du titre, jamais une inclusion — `12345` ne prouve pas
      // `123456`. Preuve la plus faible du jeu, donc testée en dernier.
      if (on('ref-in-title')) {
        for (const t of refTokensFromText(id.name, rules.weakRefLen)) {
          if (t === key.value || stripLeadingZeros(t) === key.value) return { key, evidence: 'ref-in-title' }
        }
      }
    }
  }
  return null
}
