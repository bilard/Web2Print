// src/features/priceWatch/catalog/match.ts
// Appariement catalogue source ↔ index concurrent, et calcul des écarts. PUR.
//
// L'appariement ne construit JAMAIS de table en mémoire à partir du catalogue
// concurrent complet : à l'échelle visée (75 000 références × N concurrents), cela
// dépasse la mémoire d'une Cloud Function. Il interroge un index par clé — la
// résolution d'une clé est déléguée à `IndexLookup`, que l'appelant branche sur
// Firestore (production) ou sur une Map (tests, petits volumes).

import {
  candidateKeys, proveMatch, normalizeRef, stripLeadingZeros, normalizeEan,
  isInternalBarcode, refTokensFromUrl, refTokensFromText, MIN_REF_LEN,
  type JoinKey, type MatchProof, type SourceProductKeys,
} from './keys'
import { familiesConflict, partFamilies } from './partFamily'
import { nameTokens } from './nameTokens'
import { DEFAULT_PAIRING_RULES, type PairingRules } from './pairingRules'
import type { CompetitorListing, Availability } from './competitorListing'

/** TVA française de droit commun. Paramétrable : certaines familles en dérogent. */
/** TVA par défaut, en TAUX (0,2 = 20 %). Exporté : la relecture du catalogue source
 *  doit s'y replier plutôt que d'inventer une valeur — cf. reportStore. */
export const DEFAULT_VAT_RATE = 0.2

/**
 * Clés sous lesquelles indexer un produit relevé chez un concurrent. Un même produit
 * peut être indexé plusieurs fois (référence brute, référence dépaddée, code-barres) :
 * c'est un index, la duplication y est normale et permet un lookup en O(1) quelle que
 * soit la clé dont dispose la source.
 */
export function indexKeysOf(
  listing: CompetitorListing,
  rules: PairingRules = DEFAULT_PAIRING_RULES,
): string[] {
  const out = new Set<string>()
  const addRef = (raw: string) => {
    const ref = normalizeRef(raw)
    if (ref.length < rules.minRefLen) return
    out.add(ref)
    const nz = stripLeadingZeros(ref)
    if (nz.length >= rules.minRefLen) out.add(nz)
  }
  const addEan = (raw: string) => {
    const ean = normalizeEan(raw)
    // Un code-barres interne à la boutique n'est pas une clé de jointure : l'indexer
    // exposerait à des collisions entre enseignes.
    if (ean && !isInternalBarcode(ean)) out.add(ean)
  }

  if (listing.ref) addRef(listing.ref)
  addEan(listing.gtin13 ?? '')

  // Réf en tête de titre (emc : « 002748 - Courroie … ») : seulement si assez longue
  // pour discriminer et si elle contient un chiffre (un mot seul n'est pas une réf).
  const lead = String(listing.name ?? '').trim().split(/[\s|/]+/)[0] ?? ''
  if (lead.length >= rules.weakRefLen && /\d/.test(lead)) addRef(lead)

  // EAN dans le slug d'URL (emc : « …-3582323305460.html »). Indexer permet le lookup ;
  // la preuve d'appariement reste exigée par proveMatch.
  for (const m of String(listing.url ?? '').matchAll(/\d{13}/g)) addEan(m[0])

  // Réf constructeur dans le slug d'URL (autoportee : « …-181004383-0.html »), l'ID
  // PrestaShop retiré. La preuve reste exigée (proveMatch → 'ref-in-url').
  for (const r of refTokensFromUrl(listing.url, rules.weakRefLen)) addRef(r)

  return [...out]
}

/** Clés à interroger pour un produit source, dans l'ordre de fiabilité. */
function lookupKeysOf(p: SourceProductKeys, rules: PairingRules): JoinKey[] {
  return candidateKeys(p, rules)
}

/** Résout une clé d'index en produits concurrents candidats. */
export type IndexLookup = (key: string) => CompetitorListing[] | undefined

type MatchOutcome = 'matched' | 'not-found' | 'no-key'

export interface SourceProduct extends SourceProductKeys {
  id: string
  name: string
  /** Prix de vente du catalogue source. Hors taxes par convention ERP. */
  price?: number
  /** Lien de la fiche produit sur le site de la source (pour vérification 1 clic). */
  url?: string
  /** Description catalogue, TRONQUÉE — affichage seul, aucun effet sur l'appariement. */
  description?: string
  /** Visuel : URL absolue, ou chemin relatif que l'écran préfixe. Affichage seul. */
  image?: string
  /** Chemin taxonomique (Famille › Sous-famille › Groupe produit). Affichage seul. */
  taxo?: string[]
}

export interface MatchResult {
  productId: string
  siteId: string
  outcome: MatchOutcome
  listing?: CompetitorListing
  proof?: MatchProof
  /** Candidats prouvés puis ÉCARTÉS parce que leur libellé nommait une autre pièce.
   *  Remonté jusqu'au journal du run : un produit qui devient « sans correspondance »
   *  doit pouvoir dire pourquoi, sinon il a juste l'air d'avoir disparu. */
  vetoed?: number
  /** Le même compte, VENTILÉ par démenti. Sert à dire à l'écran de réglage ce que chaque
   *  garde-fou coûte réellement : « refuse 14 » se règle, « refuse » ne se règle pas. */
  vetoedBy?: Partial<Record<VetoReason, number>>
}

/**
 * Preuves qu'un libellé contradictoire peut renverser — c'est-à-dire TOUTES sauf le
 * code-barres déclaré.
 *
 * Un EAN-13 identifie un article unique au monde : deux produits différents ne le
 * partagent pas, et si les libellés divergent c'est le titre marchand qui est fautif.
 * Une RÉFÉRENCE, en revanche, n'appartient qu'à son constructeur — et deux constructeurs
 * emploient le même numéro pour des pièces sans rapport. Mesuré sur le rapport de
 * production : « GICLEUR CARBURATEUR » réf. 5205002 et le « Filtre à huile KOHLER
 * 5205002 » de cinq marchands, tous appariés par référence, dont certains la DÉCLARENT en
 * champ `sku`. Exempter les champs déclarés laissait donc passer le gros des cas.
 */
/** Une clé de type EAN identifie un article unique au monde, PEU IMPORTE où on l'a lue :
 *  déclarée en `gtin13` ou retrouvée dans l'adresse de la fiche, treize chiffres qui
 *  coïncident ne coïncident pas par hasard. Cas VÉCU du refus à tort : « ENJOLIVEUR »
 *  réf. 122600092/0 ↔ « 122600092/0 - Protection de Roue Droite », dont l'URL portait
 *  l'EAN du produit — même référence, même code-barres, deux libellés étrangers. */
function keyIsBarcode(proof: MatchProof): boolean {
  return proof.key.kind === 'ean' || proof.evidence === 'gtin13'
}

/**
 * Une référence STRUCTURÉE — qui porte une lettre ou un séparateur — appartient à son
 * constructeur : « 122600092/0 », « 1134-4319-01 », « BS691991 », « K10HDB » ne se
 * rencontrent pas deux fois par accident.
 *
 * Une suite de CHIFFRES NUS, si : tous les catalogues numérotent pareil, et la
 * normalisation rapproche encore ce qui différait (« 0060527 » → « 60527 »,
 * « 160-8115 » → « 1608115 »). C'est la signature commune de tous les faux
 * appariements remontés du terrain — et c'est là, et seulement là, qu'on exige du
 * libellé qu'il confirme.
 */
function keyIsDistinctive(proof: MatchProof): boolean {
  return !/^\d+$/.test(proof.key.raw.trim())
}

/** L'un des deux prix est-il sans commune mesure avec l'autre ? Symétrique : une fiche
 *  vingt fois moins chère est aussi suspecte qu'une fiche vingt fois plus chère.
 *  `ratio` à 0 désactive le filet — le réglage le dit explicitement, il ne se désarme
 *  jamais par accident (une valeur illisible retombe sur le défaut, cf. `resolvePairingRules`). */
function priceAbyss(mine: number | undefined, theirs: number | undefined, ratio: number): boolean {
  if (!ratio || !mine || !theirs || mine <= 0 || theirs <= 0) return false
  return theirs / mine > ratio || mine / theirs > ratio
}

/**
 * Les deux libellés se corroborent-ils ? Un mot en commun, ou une même famille de pièce.
 *
 * La comparaison porte sur des RACINES de quatre lettres, pas sur des mots entiers :
 * « pince » et « pinces », « raccord » et « raccordement », « couteau » et « couteaux »
 * désignent la même chose et n'ont pourtant aucun token identique. Les nombres sont
 * exclus — une cote commune ne rapproche rien.
 */
const ROOT_LEN = 4

function corroborated(
  sourceName: string,
  listingName: string | undefined,
  rules: PairingRules = DEFAULT_PAIRING_RULES,
): boolean {
  const left = nameTokens(sourceName).filter((t) => !/^\d+$/.test(t))
  const right = nameTokens(listingName).filter((t) => !/^\d+$/.test(t))
  if (left.length === 0 || right.length === 0) return false
  for (const a of left) {
    for (const b of right) {
      if (a === b) return true
      const n = Math.min(a.length, b.length)
      if (n >= ROOT_LEN && a.slice(0, n) === b.slice(0, n)) return true
    }
  }
  const lf = partFamilies(sourceName, rules.extraFamilies)
  if (lf.size === 0) return false
  for (const f of partFamilies(listingName, rules.extraFamilies)) if (lf.has(f)) return true
  return false
}

/**
 * Les trois démentis, en UN seul endroit — c'est la règle complète que la matrice
 * applique. Exportée pour que la recherche dirigée puisse s'y aligner (réglage
 * `unifyDirectedVetoes`) au lieu d'en tenir une seconde version qui dérive.
 *
 * Un prix source absent neutralise le seul test qui en dépend (le gouffre) : c'est une
 * dégradation propre, pas une exemption — les deux autres démentis restent armés.
 */
/** Le démenti qui a refusé une paire. `null` = aucun, la paire est retenue. */
export type VetoReason = 'family' | 'price-abyss' | 'no-corroboration'

/**
 * QUEL démenti refuse cette paire — ou `null` si elle passe.
 *
 * ⚠ Rend le PREMIER qui se déclenche, et s'arrête là : c'est exactement l'ordre
 * d'évaluation du moteur (les trois tests étaient chaînés par `||`). Une paire refusée
 * pour deux raisons n'est donc comptée qu'une fois, sous la première — sans quoi les
 * compteurs par démenti dépasseraient le total des refus et l'écran mentirait sur ce que
 * chaque réglage coûte.
 */
export function vetoReason(
  source: { name?: string; price?: number },
  candidate: { name?: string; price?: number },
  proof: MatchProof,
  rules: PairingRules = DEFAULT_PAIRING_RULES,
): VetoReason | null {
  // Un code-barres se suffit à lui-même — aucun libellé ne le renverse.
  if (keyIsBarcode(proof)) return null
  const sourceName = source.name ?? ''
  if (rules.familyVeto && familiesConflict(sourceName, candidate.name, rules.extraFamilies)) return 'family'
  if (priceAbyss(source.price, candidate.price, rules.priceAbyssRatio)) return 'price-abyss'
  // Le libellé doit CONFIRMER quand la clé, elle, ne prouve rien : une suite de
  // chiffres nus n'appartient à personne.
  if (rules.corroborateNumericKeys
    && !keyIsDistinctive(proof) && !corroborated(sourceName, candidate.name, rules)) return 'no-corroboration'
  return null
}

export function vetoedPair(
  source: { name?: string; price?: number },
  candidate: { name?: string; price?: number },
  proof: MatchProof,
  rules: PairingRules = DEFAULT_PAIRING_RULES,
): boolean {
  return vetoReason(source, candidate, proof, rules) !== null
}

/**
 * Apparie un produit source à l'index d'un concurrent.
 *
 * Trois verrous, dans cet ordre : la clé doit RÉSOUDRE dans l'index, l'appariement doit
 * être PROUVÉ par égalité exacte (`proveMatch`), et les deux libellés ne doivent pas
 * nommer des pièces INCOMPATIBLES.
 *
 * Le second verrou n'est pas redondant avec le premier : un index peut contenir des
 * collisions (deux produits sous la même référence dépaddée), et un candidat non prouvé
 * doit être rejeté, jamais retenu faute de mieux.
 *
 * Le TROISIÈME est là parce qu'une référence retrouvée dans une URL ne prouve pas ce
 * qu'elle a l'air de prouver. Cas VÉCU : « CARBURATEUR » réf. 5208301 apparié à « Mousse
 * pré-filtre à air CUB CADET », les sept chiffres figurant dans l'adresse de la fiche. Le
 * même nombre s'y trouve, les deux articles n'ont rien à voir. Tant que ce démenti ne
 * faisait que baisser un indice de confiance, la paire restait APPARIÉE : elle occupait
 * la place du vrai concurrent et son prix entrait dans le comparatif. Un trou vaut mieux
 * qu'un faux prix — principe de tout ce module.
 *
 * ⚠ Le veto ne se déclenche que si les DEUX libellés nomment une famille de pièce et
 * qu'aucune n'est commune (cf. `familiesConflict`). Un côté muet, ou un mot inconnu du
 * lexique, ne rejette rien : on ne condamne jamais pour une absence. Mesuré sur le
 * rapport de production : 14 cellules sur 1 847, toutes de vrais faux appariements.
 *
 * Un lexique ne peut pas tout nommer : `priceAbyss` prend le relais quand aucun mot ne
 * parle, sur le seul rapport des prix.
 */
export function matchProduct(
  product: SourceProduct,
  siteId: string,
  lookup: IndexLookup,
  rules: PairingRules = DEFAULT_PAIRING_RULES,
): MatchResult {
  const keys = lookupKeysOf(product, rules)
  if (keys.length === 0) return { productId: product.id, siteId, outcome: 'no-key' }

  let vetoed = 0
  const vetoedBy: Partial<Record<VetoReason, number>> = {}
  for (const key of keys) {
    for (const candidate of lookup(key.value) ?? []) {
      const proof = proveMatch([key], {
        sku: candidate.ref,
        gtin13: candidate.gtin13,
        url: candidate.url,
        name: candidate.name,
      }, rules)
      if (!proof) continue
      // Candidat écarté, pas produit rejeté : on continue de chercher — une autre fiche
      // du même site peut porter la bonne pièce sous la même clé.
      // ⚠ CHARGE DE LA PREUVE INVERSÉE — changement de doctrine, décidé sur le terrain.
      // Une référence n'est PAS unique d'un fournisseur à l'autre : chaque constructeur
      // numérote comme il veut, et la normalisation rapproche encore ce qui différait
      // (« 0060527 » → « 60527 », « 160-8115 » → « 1608115 »). Le rapprochement doit
      // donc être CORROBORÉ par le libellé, au lieu d'être présumé bon jusqu'à
      // contradiction. Seul le code-barres échappe à cette exigence.
      // Un code-barres se suffit à lui-même — aucun libellé ne le renverse.
      const veto = vetoReason(product, candidate, proof, rules)
      if (veto) {
        vetoed++
        vetoedBy[veto] = (vetoedBy[veto] ?? 0) + 1
        continue
      }
      return { productId: product.id, siteId, outcome: 'matched', listing: candidate, proof }
    }
  }
  return { productId: product.id, siteId, outcome: 'not-found', vetoed, vetoedBy }
}

/**
 * Clés lues dans le LIBELLÉ complet de la fiche, hors celles déjà émises par
 * `indexKeysOf`. Chez la moitié des marchands relevés, la référence constructeur n'est
 * écrite QUE là (« Courroie tondeuse autoportée VIKING 6151-704-2110 »).
 *
 * Séparées des clés sûres parce qu'elles n'ont pas le même statut : un libellé peut
 * citer la référence d'un produit VOISIN (compatibilités, déclinaisons). `buildMemoryIndex`
 * écarte donc celles qui désignent plusieurs fiches distinctes.
 */
export function titleKeysOf(
  listing: CompetitorListing,
  rules: PairingRules = DEFAULT_PAIRING_RULES,
): string[] {
  const already = new Set(indexKeysOf(listing, rules))
  return refTokensFromText(listing.name, rules.weakRefLen).filter((k) => !already.has(k))
}

/**
 * Une seule fiche par URL. Les pages liste se recouvrent (pagination re-balayée d'un
 * cycle à l'autre) : sur le terrain, un site est monté à 97 % de doublons. Sans cette
 * passe, l'index gonfle la mémoire, fausse les compteurs de fiches, et fait passer une
 * même fiche vue N fois pour N produits homonymes (donc pour une clé ambiguë).
 *
 * Entre deux relevés d'une même URL, on garde le plus RENSEIGNÉ (un relevé sans prix
 * arrive quand le thème charge le prix en AJAX) — jamais simplement le dernier.
 */
export function dedupeListings(listings: CompetitorListing[]): CompetitorListing[] {
  const byUrl = new Map<string, CompetitorListing>()
  const score = (l: CompetitorListing) =>
    (l.price != null ? 4 : 0) + (l.ref || l.gtin13 ? 2 : 0) + (l.availability ? 1 : 0)
  for (const l of listings) {
    const url = String(l.url ?? '')
    if (!url) continue
    const prev = byUrl.get(url)
    if (!prev || score(l) > score(prev)) byUrl.set(url, l)
  }
  return [...byUrl.values()]
}

/**
 * Index en mémoire d'un catalogue concurrent.
 *
 * Deux niveaux de clés : celles d'`indexKeysOf` (référence/code-barres déclarés, EAN
 * d'URL) sont posées telles quelles ; celles du libellé ne sont posées que si elles
 * restent NON AMBIGUËS — une clé de titre qui désigne deux fiches distinctes est
 * retirée, et une clé déjà portée par une clé sûre n'est jamais renforcée par un titre.
 * Principe du module : un trou vaut mieux qu'un faux prix.
 */
export function buildMemoryIndex(
  listings: CompetitorListing[],
  rules: PairingRules = DEFAULT_PAIRING_RULES,
): IndexLookup {
  const unique = dedupeListings(listings)
  const map = new Map<string, CompetitorListing[]>()
  for (const l of unique) {
    for (const key of indexKeysOf(l, rules)) {
      const bucket = map.get(key)
      if (bucket) bucket.push(l)
      else map.set(key, [l])
    }
  }
  // Clés de titre : collectées à part, puis versées seulement si elles restent seules.
  const fromTitle = new Map<string, CompetitorListing[]>()
  for (const l of unique) {
    for (const key of titleKeysOf(l, rules)) {
      if (map.has(key)) continue // une clé déclarée fait foi
      const bucket = fromTitle.get(key)
      if (bucket) bucket.push(l)
      else fromTitle.set(key, [l])
    }
  }
  for (const [key, bucket] of fromTitle) {
    if (bucket.length === 1) map.set(key, bucket)
  }
  return (key) => map.get(key)
}

export interface PriceComparison {
  /** Prix concurrent TTC, tel qu'affiché sur le site marchand. */
  priceTtc?: number
  /** Prix barré TTC (avant remise), quand le site en affiche un. */
  listPriceTtc?: number
  /** Prix concurrent ramené hors taxes, pour être comparable au prix source. */
  priceHt?: number
  /** Écart en euros HT : concurrent − source. Négatif = le concurrent est moins cher. */
  deltaHt?: number
  /** Écart relatif en %, arrondi au dixième. */
  deltaPct?: number
  /** Position du prix source face au concurrent. */
  position?: 'cheaper' | 'aligned' | 'more-expensive'
  availability?: Availability
  /**
   * Pourquoi le prix relevé n'a PAS été retenu — quand il ne l'a pas été.
   *
   * Le garde-fou anti-prix-aberrant écartait en silence : la cellule affichait « prix non
   * exploitable » sans distinguer « le site n'affiche aucun prix » de « nous avons refusé
   * celui qu'il affiche ». Les deux demandent pourtant des gestes opposés — vérifier le
   * scraping dans un cas, revoir l'appariement ou le seuil dans l'autre.
   *
   * ⚠ Calculé à la volée, jamais persisté dans le rapport : le poids d'une cellule est
   * compté au byte près (plafond d'un mégaoctet, cf. le découpage du rapport).
   */
  rejected?: 'below-floor' | 'drop-too-deep'
  /** Écart qui a motivé le refus, en % — c'est LUI qui rend le refus discutable. */
  rejectedPct?: number
  /**
   * Le prix RELEVÉ, tel quel, quand il a été écarté.
   *
   * ⚠ Écarter n'est pas cacher. Ces montants restent hors de TOUT calcul — écart, position,
   * médianes, KPI —, mais les masquer à l'écran privait du seul élément qui permet de
   * trancher : un fusible à 1,50 € face à un prix source de 20 € affiche −92 % et paraît
   * aberrant, alors qu'il peut être parfaitement juste (lot contre pièce, ou tarif
   * grossiste). Le lecteur doit voir le chiffre pour juger si c'est le prix qui est faux,
   * l'appariement, ou le seuil.
   */
  rejectedHt?: number
  rejectedTtc?: number
}

/** Arrondi monétaire au centime. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Compare un prix source (HT) au prix relevé chez un concurrent.
 *
 * Les marchands B2C relevés affichent du TTC. On expose les deux formes : le TTC
 * verbatim (ce que voit l'acheteur) et un HT recalculé (seul comparable au prix
 * catalogue). Quand le site déclare explicitement un prix HT, aucune conversion.
 *
 * `alignedPct` : bande d'indifférence sous laquelle deux prix sont dits alignés — un
 * écart de quelques centimes n'est pas un signal de positionnement.
 */
export function comparePrices(
  sourcePriceHt: number | undefined,
  listing: CompetitorListing,
  opts: { vatRate?: number; alignedPct?: number; rules?: PairingRules } = {},
): PriceComparison {
  const rules = opts.rules ?? DEFAULT_PAIRING_RULES
  const vat = opts.vatRate ?? DEFAULT_VAT_RATE
  // `alignedPct` explicite l'emporte sur le réglage : c'est un paramètre d'appel, et le
  // réglage n'est là que pour les appelants qui n'en passent pas.
  const alignedPct = opts.alignedPct ?? rules.alignedPct
  const out: PriceComparison = { availability: listing.availability }

  if (listing.price == null) return out

  // taxIncluded absent = marchand B2C français : TTC par défaut. L'inverse
  // (supposer du HT) sous-estimerait le prix concurrent de 20 % et produirait des
  // alertes de positionnement fausses.
  const isHt = listing.taxIncluded === false
  const priceHt = round2(isHt ? listing.price : listing.price / (1 + vat))

  // Garde-fou anti-prix-aberrant : un prix concurrent quasi nul (< 1 €), ou plus creux
  // que -60 % face au prix source, trahit presque toujours une erreur de PARSING — le
  // sélecteur de prix du thème PrestaShop a capté une quantité, un « 0 » ou un fragment
  // au lieu du prix (cf. pro-motoculture : « 0 €/2 €/5 € » sur des courroies à 20 €). On
  // écarte ce concurrent : mieux vaut PAS de prix qu'un faux qui pollue le classement et
  // les alertes. Seuil heuristique — les vrais écarts observés restent au-dessus de -55 %.
  const provisionalPct = sourcePriceHt != null && sourcePriceHt > 0
    ? ((priceHt - sourcePriceHt) / sourcePriceHt) * 100
    : 0
  if (priceHt < rules.minPriceEur || provisionalPct < -rules.maxDropPct) {
    // Le motif accompagne le refus : « écarté à −64 % » se discute, « non exploitable » non.
    out.rejected = priceHt < rules.minPriceEur ? 'below-floor' : 'drop-too-deep'
    if (out.rejected === 'drop-too-deep') out.rejectedPct = Math.round(provisionalPct * 10) / 10
    // Le montant voyage AVEC son refus, jamais à la place d'un prix retenu : les champs
    // sont distincts de `priceHt`/`priceTtc`, si bien qu'aucun calcul ne peut le prendre
    // pour argent comptant — il n'est lisible que par qui le demande explicitement.
    out.rejectedHt = priceHt
    out.rejectedTtc = round2(isHt ? listing.price * (1 + vat) : listing.price)
    return out // { availability, rejected, rejected*} — prix relevé, montré, mais hors calcul
  }

  out.priceTtc = round2(isHt ? listing.price * (1 + vat) : listing.price)
  out.priceHt = priceHt
  if (listing.listPrice != null) {
    out.listPriceTtc = round2(isHt ? listing.listPrice * (1 + vat) : listing.listPrice)
  }

  if (sourcePriceHt != null && sourcePriceHt > 0) {
    out.deltaHt = round2(priceHt - sourcePriceHt)
    out.deltaPct = Math.round(((priceHt - sourcePriceHt) / sourcePriceHt) * 1000) / 10
    out.position = Math.abs(out.deltaPct) < alignedPct
      ? 'aligned'
      : out.deltaPct > 0 ? 'cheaper' : 'more-expensive'
  }
  return out
}

/**
 * Mots par lesquels une phrase cesse d'énumérer des RÉFÉRENCES pour énumérer des
 * MACHINES. La liste s'arrête là.
 *
 * Cas VÉCU, mesuré : « Bande de frein adaptable STIHL **remplace 1123-160-5400 pour
 * modèles** 017, 018, 020T, 021, 023, 025, MS170, MS171 … » rendait DIX-SEPT clés —
 * « 018 », « MS170 », « MS210 »… — et **perdait la seule vraie** (`1123-160-5400`, collée
 * à « pour modèles 017 » dans un fragment que le filtre de token rejette pour ses
 * espaces). Le libellé annonçait donc la bonne référence, et le moteur retenait tout sauf
 * elle : la bande de frein s'appariait à un PIGNON de chaîne par « MS170 ».
 *
 * Retirer les mots de compatibilité du LEAD ne suffisait pas — ici l'annonce est bien un
 * remplacement, c'est la SUITE de la phrase qui change de sujet.
 */
const MACHINE_LIST_STOP = /\b(?:pour|modèles?|modeles?|machines?|séries?|series?|types?|convient|adaptable|compatible|montage|utilisation)\b/i

/**
 * Tronque une liste annoncée au moment où elle passe aux machines.
 *
 * ⚠ La troncature est ABANDONNÉE si ce qui précède le mot d'arrêt ne contient aucun
 * chiffre : « Remplace origine **pour** STIHL : 1234 » place le mot d'arrêt AVANT la
 * référence, et couper là ne laisserait rien. Sans ce garde, une formulation courante
 * perdrait sa référence au lieu d'en gagner — l'inverse exact du but.
 */
function stopAtMachineList(segment: string): string {
  const cut = segment.search(MACHINE_LIST_STOP)
  if (cut < 0) return segment
  const head = segment.slice(0, cut)
  return /\d/.test(head) ? head : segment
}

/**
 * Références d'origine citées dans une description commerciale.
 * « Lame adaptable pour AL-KO. Remplace origine: 516747, 344769, 117720. »
 *   → ['516747', '344769', '117720']
 *
 * Enjeu métier : sur un catalogue de pièces, les articles ADAPTABLES portent une
 * référence interne au distributeur, absente de tout catalogue concurrent. Les
 * références d'origine qu'ils remplacent sont, elles, universelles — c'est la seule
 * clé de jointure disponible pour cette part du catalogue.
 *
 * ⚠⚠ NE LIT QUE LES FORMULATIONS DE REMPLACEMENT, JAMAIS CELLES DE COMPATIBILITÉ.
 * « Remplace », « Origine », « Réf. constructeur », « OEM », « Équivalent »,
 * « Correspondance » annoncent la référence de la PIÈCE remplacée. « Compatible avec »
 * et « Compatibilité » annoncent tout autre chose : la liste des MACHINES sur lesquelles
 * la pièce se monte. Les deux étaient lus indifféremment, et c'est ce qui fabriquait des
 * appariements faux à la chaîne — cas VÉCU, mesuré :
 *
 *   « VERROU TOURNANT » réf. 4100580, description « … compatible avec les modèles STIHL
 *   MS210, MS210C-B, MS230, MS250, MS290 … Remplace origine 1123 141 2301 » émettait
 *   onze clés « MS210CB », « MS230 », « MS250 »… Chez autoportee-discount, le slug
 *   `/32604-pignon-pour-tronconneuse-stihl-017-…-ms210-ms211-ms230.html` porte ces mêmes
 *   désignations : `proveMatch` prouvait « MS230 == MS230 » (`ref-in-url`), et un verrou
 *   de filtre à air se retrouvait apparié à un PIGNON de chaîne.
 *
 * Ce cas réfute l'argument qui avait autorisé l'élargissement (« le risque de faux positif
 * reste nul, la clé doit ensuite être PROUVÉE chez le concurrent ») : une preuve d'ÉGALITÉ
 * n'est pas une preuve d'IDENTITÉ quand la clé, elle, n'identifie pas un article. Un
 * modèle de machine est partagé par toutes les pièces qui s'y montent — il apparie donc
 * n'importe laquelle avec n'importe quelle autre.
 *
 * Prix à payer, assumé : une description qui écrit « Compatible avec : 181004383/0 » — la
 * référence de la pièce sous un mot de compatibilité — n'émet plus de clé. Un trou vaut
 * mieux qu'un faux prix, et le catalogue écrit ses vraies références d'origine sous
 * « Remplace origine ».
 */
export function extractOriginRefs(description: string | null | undefined): string[] {
  const text = String(description ?? '')
  if (!text) return []
  const out: string[] = []
  const seen = new Set<string>()

  // Formulations reconnues — TOUTES annoncent la référence de la pièce REMPLACÉE :
  //   « Remplace origine », « Origine », « Remplace », « Remplace les références »,
  //   « Réf. origine », « Référence d'origine », « Réf constructeur », « OEM »,
  //   « Équivalent », « Correspondance ».
  // Élargi après relevé en production : le catalogue n'appariait AUCUN produit par
  // référence d'origine (« 0 orig. » sur 16 483 appariés) alors que ces références sont
  // les seules qu'un concurrent puisse porter sur des pièces adaptables.
  //
  // ⚠⚠ « Compatible avec » et « Compatibilité » ont été RETIRÉS de cette liste (elles y
  // figuraient depuis le même élargissement) : ce sont des annonces de MACHINES, pas de
  // références — cf. l'en-tête de cette fonction pour le cas mesuré.
  //
  // La liste se termine à une fin de PHRASE (point suivi d'un blanc ou de la fin) et
  // non au premier point : les références en contiennent (« 000.02.501 »).
  const LEAD = String.raw`(?:remplace\s+(?:les\s+)?(?:r[ée]f[ée]rences?|origines?)?|r[ée]f[\.]?\s*(?:d['’]?)?origine|r[ée]f[ée]rence\s+(?:d['’]?)?origine|r[ée]f[\.]?\s*constructeur|origine|oem|[ée]quivalen(?:t|ce)s?|correspondances?)`
  // ⚠⚠ Le deux-points est OPTIONNEL. Il était exigé, et c'est ce qui laissait 105 000
  // lignes sur 115 814 sans la moindre référence d'origine : « Remplace origine 516747 »,
  // « Équivalent 532134149 », « Réf. origine – 117720 » s'écrivent tous les jours sans
  // ponctuation, et aucun n'était vu. Or ces références sont les SEULES qu'un concurrent
  // puisse porter sur une pièce adaptable — elles produisent déjà 592 des 974 appariements
  // du catalogue, à partir des 9 % de lignes qui, elles, portaient un deux-points.
  //
  // ⚠ Ce qui rend cet assouplissement-là sans danger, c'est le MOT qui précède, pas la
  // preuve qui suit. « Élargir ici élargit la recherche, jamais l'acceptation » a été
  // écrit — et démenti par le terrain : `proveMatch` valide une ÉGALITÉ, il ne vérifie
  // pas que la clé désigne un article. Rendre le deux-points optionnel ne change pas
  // QUELLES références sont lues, seulement leur ponctuation : c'est pour cela que
  // celui-ci est sûr, et que l'ajout des mots de compatibilité ne l'était pas.
  for (const m of text.matchAll(new RegExp(String.raw`${LEAD}\s*(?::|[-–—])?\s*([\s\S]{2,300}?)(?=\.(?:\s|$)|;|$)`, 'gi'))) {
    for (const token of stopAtMachineList(m[1]).split(/[,;]| et /i)) {
      const raw = token.trim().replace(/\s*\)$/, '')
      // Une référence contient au moins un chiffre : écarte les mots de la phrase.
      if (!/\d/.test(raw)) continue
      if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{2,}$/.test(raw)) continue
      const norm = normalizeRef(raw)
      if (norm.length < MIN_REF_LEN || seen.has(norm)) continue
      seen.add(norm)
      out.push(raw)
    }
  }
  return out
}
