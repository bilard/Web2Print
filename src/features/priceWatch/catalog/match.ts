// Appariement catalogue source ↔ index concurrent, et calcul des écarts. PUR.
//
// L'appariement ne construit JAMAIS de table en mémoire à partir du catalogue
// concurrent complet : à l'échelle visée (75 000 références × N concurrents), cela
// dépasse la mémoire d'une Cloud Function. Il interroge un index par clé — la
// résolution d'une clé est déléguée à `IndexLookup`, que l'appelant branche sur
// Firestore (production) ou sur une Map (tests, petits volumes).

import {
  candidateKeys, proveMatch, normalizeRef, stripLeadingZeros, normalizeEan,
  isInternalBarcode, refTokensFromUrl, refTokensFromText, MIN_REF_LEN, WEAK_REF_LEN,
  type JoinKey, type MatchProof, type SourceProductKeys,
} from './keys'
import { familiesConflict, partFamilies } from './partFamily'
import { nameTokens } from './nameMatch'
import type { CompetitorListing, Availability } from './prestashop'

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
export function indexKeysOf(listing: CompetitorListing): string[] {
  const out = new Set<string>()
  const addRef = (raw: string) => {
    const ref = normalizeRef(raw)
    if (ref.length < MIN_REF_LEN) return
    out.add(ref)
    const nz = stripLeadingZeros(ref)
    if (nz.length >= MIN_REF_LEN) out.add(nz)
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
  if (lead.length >= WEAK_REF_LEN && /\d/.test(lead)) addRef(lead)

  // EAN dans le slug d'URL (emc : « …-3582323305460.html »). Indexer permet le lookup ;
  // la preuve d'appariement reste exigée par proveMatch.
  for (const m of String(listing.url ?? '').matchAll(/\d{13}/g)) addEan(m[0])

  // Réf constructeur dans le slug d'URL (autoportee : « …-181004383-0.html »), l'ID
  // PrestaShop retiré. La preuve reste exigée (proveMatch → 'ref-in-url').
  for (const r of refTokensFromUrl(listing.url)) addRef(r)

  return [...out]
}

/** Clés à interroger pour un produit source, dans l'ordre de fiabilité. */
function lookupKeysOf(p: SourceProductKeys): JoinKey[] {
  return candidateKeys(p)
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
const VETOABLE_EVIDENCE = new Set<MatchProof['evidence']>([
  'ref-in-url', 'ref-in-title', 'ref-in-name', 'ean-in-url', 'sku', 'mpn',
])

/**
 * Rapport de prix au-delà duquel deux articles ne peuvent pas être le même, quoi que
 * dise la référence. Filet UNIVERSEL, complémentaire du lexique : il attrape ce qu'aucun
 * mot connu ne dénonce — cas VÉCU « BAGUE DE ROUE » 1,91 € ↔ « Chaussure de travail
 * GRISPORT » 176,32 €, soit +9 131 %.
 *
 * ×21 est volontairement ÉNORME. F1 est grossiste et ces marchands vendent au détail :
 * un facteur 2 ou 3 est le marché normal. Un lot explique davantage — mesuré sur le
 * rapport de production, le pire cas légitime est « COUTEAU » 3,01 € ↔ « Couteaux
 * scarificateurs x16 » 41,49 €, soit ×14. Au-delà de vingt-et-un, plus aucun
 * conditionnement ne rend compte de l'écart. Mesure : 0 cellule sur 1 847 touchée, dans
 * les deux sens.
 *
 * La TVA est ignorée à dessein : mon prix est HT, le sien souvent TTC, et 20 % ne
 * déplacent pas un seuil de 2 100 %.
 */
const PRICE_ABYSS_RATIO = 21

/** L'un des deux prix est-il sans commune mesure avec l'autre ? Symétrique : une fiche
 *  vingt fois moins chère est aussi suspecte qu'une fiche vingt fois plus chère. */
function priceAbyss(mine: number | undefined, theirs: number | undefined): boolean {
  if (!mine || !theirs || mine <= 0 || theirs <= 0) return false
  return theirs / mine > PRICE_ABYSS_RATIO || mine / theirs > PRICE_ABYSS_RATIO
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

function corroborated(sourceName: string, listingName: string | undefined): boolean {
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
  const lf = partFamilies(sourceName)
  if (lf.size === 0) return false
  for (const f of partFamilies(listingName)) if (lf.has(f)) return true
  return false
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
): MatchResult {
  const keys = lookupKeysOf(product)
  if (keys.length === 0) return { productId: product.id, siteId, outcome: 'no-key' }

  let vetoed = 0
  for (const key of keys) {
    for (const candidate of lookup(key.value) ?? []) {
      const proof = proveMatch([key], {
        sku: candidate.ref,
        gtin13: candidate.gtin13,
        url: candidate.url,
        name: candidate.name,
      })
      if (!proof) continue
      // Candidat écarté, pas produit rejeté : on continue de chercher — une autre fiche
      // du même site peut porter la bonne pièce sous la même clé.
      // ⚠ CHARGE DE LA PREUVE INVERSÉE — changement de doctrine, décidé sur le terrain.
      // Une référence n'est PAS unique d'un fournisseur à l'autre : chaque constructeur
      // numérote comme il veut, et la normalisation rapproche encore ce qui différait
      // (« 0060527 » → « 60527 », « 160-8115 » → « 1608115 »). Le rapprochement doit
      // donc être CORROBORÉ par le libellé, au lieu d'être présumé bon jusqu'à
      // contradiction. Seul le code-barres échappe à cette exigence.
      if (VETOABLE_EVIDENCE.has(proof.evidence)
        && (!corroborated(product.name, candidate.name)
          || familiesConflict(product.name, candidate.name)
          || priceAbyss(product.price, candidate.price))) {
        vetoed++
        continue
      }
      return { productId: product.id, siteId, outcome: 'matched', listing: candidate, proof }
    }
  }
  return { productId: product.id, siteId, outcome: 'not-found', vetoed }
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
export function titleKeysOf(listing: CompetitorListing): string[] {
  const already = new Set(indexKeysOf(listing))
  return refTokensFromText(listing.name).filter((k) => !already.has(k))
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
export function buildMemoryIndex(listings: CompetitorListing[]): IndexLookup {
  const unique = dedupeListings(listings)
  const map = new Map<string, CompetitorListing[]>()
  for (const l of unique) {
    for (const key of indexKeysOf(l)) {
      const bucket = map.get(key)
      if (bucket) bucket.push(l)
      else map.set(key, [l])
    }
  }
  // Clés de titre : collectées à part, puis versées seulement si elles restent seules.
  const fromTitle = new Map<string, CompetitorListing[]>()
  for (const l of unique) {
    for (const key of titleKeysOf(l)) {
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
  opts: { vatRate?: number; alignedPct?: number } = {},
): PriceComparison {
  const vat = opts.vatRate ?? DEFAULT_VAT_RATE
  const alignedPct = opts.alignedPct ?? 1
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
  if (priceHt < 1 || provisionalPct < -60) return out // { availability } seul — prix rejeté

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
 * Références d'origine citées dans une description commerciale.
 * « Lame adaptable pour AL-KO. Remplace origine: 516747, 344769, 117720. »
 *   → ['516747', '344769', '117720']
 *
 * Enjeu métier : sur un catalogue de pièces, les articles ADAPTABLES portent une
 * référence interne au distributeur, absente de tout catalogue concurrent. Les
 * références d'origine qu'ils remplacent sont, elles, universelles — c'est la seule
 * clé de jointure disponible pour cette part du catalogue.
 */
export function extractOriginRefs(description: string | null | undefined): string[] {
  const text = String(description ?? '')
  if (!text) return []
  const out: string[] = []
  const seen = new Set<string>()

  // Formulations reconnues, toutes suivies de « : » puis d'une liste :
  //   « Remplace origine », « Origine », « Remplace », « Réf. origine », « Référence
  //   d'origine », « Réf constructeur », « OEM », « Équivalent », « Compatible »,
  //   « Remplace les références », « Correspondance ».
  // Élargi après relevé en production : le catalogue n'appariait AUCUN produit par
  // référence d'origine (« 0 orig. » sur 16 483 appariés) alors que ces références sont
  // les seules qu'un concurrent puisse porter sur des pièces adaptables. Le risque de
  // faux positif reste nul : une clé candidate doit ensuite être PROUVÉE chez le
  // concurrent par `proveMatch` — elle élargit la recherche, jamais l'acceptation.
  //
  // La liste se termine à une fin de PHRASE (point suivi d'un blanc ou de la fin) et
  // non au premier point : les références en contiennent (« 000.02.501 »).
  const LEAD = String.raw`(?:remplace\s+(?:les\s+)?(?:r[ée]f[ée]rences?|origines?)?|r[ée]f[\.]?\s*(?:d['’]?)?origine|r[ée]f[ée]rence\s+(?:d['’]?)?origine|r[ée]f[\.]?\s*constructeur|origine|oem|[ée]quivalen(?:t|ce)s?|compatible\s+avec|compatibilit[ée]|correspondances?)`
  for (const m of text.matchAll(new RegExp(String.raw`${LEAD}\s*:\s*([\s\S]{2,300}?)(?=\.(?:\s|$)|;|$)`, 'gi'))) {
    for (const token of m[1].split(/[,;]| et /i)) {
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
