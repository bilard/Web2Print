// Indice de fiabilité d'un appariement F1 ↔ concurrent. PUR : aucune dépendance
// React/Firebase.
//
// À quoi il sert : `proveMatch` ne rend qu'un verdict binaire (prouvé / pas prouvé), et
// ses sept natures de preuve n'ont pas la même valeur. Un GTIN déclaré des deux côtés est
// une quasi-certitude ; une référence repérée au milieu d'un libellé libre est une
// coïncidence plausible. L'écran d'audit doit trier les secondes des premières.
//
// ⚠ RÈGLE DE CONCEPTION — on retranche pour une CONTRADICTION, jamais pour une
// corroboration absente. Le catalogue F1 est en anglais, celui des marchands en français
// (« SWITCH BOX BATTERY » ↔ « Boîtier de commutation ») : l'absence de mot commun est la
// norme, pas un indice. Pénaliser dessus condamnerait en masse des appariements justes,
// et le premier écran d'audit serait rouge à tort. Les mots communs ne peuvent que
// MONTER le score.
import { normalizeEan, normalizeRef, type MatchEvidence } from '../catalog/keys'
import { nameTokens } from '../catalog/nameMatch'
import { familiesConflict } from '../catalog/partFamily'

/** Trois bandes seulement : agir, vérifier, laisser. Une échelle plus fine ne se lit pas. */
export type ConfidenceBand = 'sure' | 'check' | 'doubt'

/** Motif de DOUTE — chacun est une contradiction observée, jamais une absence. */
export type DoubtReason =
  | 'ean-conflict'   // les deux publient un code-barres, et ils diffèrent
  | 'ref-conflict'   // les deux publient une référence structurée, et elles diffèrent
  | 'weak-key'       // la clé qui prouve est courte : collision plausible
  | 'numeric-short'  // clé tout en chiffres et courte, trouvée dans un texte ou une URL
  | 'origin-key'     // correspondance indirecte (réf. d'origine citée), pas la pièce elle-même
  | 'contested'      // plusieurs produits F1 revendiquent cette même fiche
  | 'price-gulf'     // prix sans commune mesure avec le mien
  | 'price-abyss'    // rapport de prix qu'aucune marge de distribution n'explique
  | 'family-conflict' // les deux libellés nomment des pièces incompatibles
  | 'visual-conflict' // les photos montrent des objets de natures distinctes

/** Motif de RENFORT — ne peut que faire monter le score, jamais changer de bande. */
export type SupportReason = 'title-echo' | 'ean-echo' | 'ref-echo' | 'visual-echo'
  /** Une SECONDE de nos références se retrouve chez ce concurrent. Le seul renfort qui
   *  agisse sur la BANDE et non sur le seul score — voir `SECOND_KEY_PROOF`. */
  | 'second-key'

export interface Confidence {
  score: number
  band: ConfidenceBand
  doubts: DoubtReason[]
  supports: SupportReason[]
  /** Rouages du calcul, conservés pour pouvoir REJOUER la bande quand un signal arrive
   *  après coup (cf. `withVisual`). `core` = base moins les pénalités ; `bonus` = ce que
   *  les renforts ajoutent au score sans toucher à la bande. */
  raw: { core: number; bonus: number }
}

/**
 * Verdict de la comparaison des PHOTOS. Union déclarée ici plutôt qu'importée : ce module
 * est PUR et ne dépend d'aucun autre — le compilateur vérifie la compatibilité au point
 * d'appel.
 */
export type VisualCall = 'same' | 'different' | 'unclear'

/**
 * Valeur de départ, par nature de preuve. L'ordre reprend celui de `proveMatch`, qui teste
 * du plus concluant au plus fragile : un code-barres déclaré, puis les champs d'identité,
 * puis le libellé et l'URL — là où un nombre peut n'être qu'un nombre.
 */
const BASE: Record<MatchEvidence, number> = {
  gtin13: 98,
  'ean-in-url': 88,
  sku: 86,
  mpn: 84,
  // Référence en TÊTE de titre et token entier du slug d'URL : `proveMatch` ne les
  // accepte que sur une clé FORTE (≥ 5 caractères, délimitée). Elles restent donc du côté
  // acquis. Les placer sous la barre rendait la bande « sûr » inatteignable sur tout un
  // site PrestaShop sans données structurées — filtrer « sûrs seulement » y donnait un
  // écran vide, ce qui se lit comme une panne, pas comme un résultat.
  'ref-in-name': 84,
  'ref-in-url': 80,
  // Seule preuve laissée en dessous : un nombre au milieu d'un libellé libre peut n'être
  // qu'un nombre. C'est le cas qui mérite vraiment l'œil humain.
  'ref-in-title': 62,
}

const PENALTY: Record<DoubtReason, number> = {
  'ean-conflict': 45,
  'ref-conflict': 15,
  'weak-key': 18,
  // Cas VÉCU : « CIRCLIP GUTBROD » réf. 000.11.036 apparié à « Filtre à gaz Toyota
  // 90917-11036 » — la clé dépaddée valait « 11036 », cinq chiffres retrouvés dans le
  // slug du concurrent. Une référence ALPHANUMÉRIQUE de cinq caractères discrimine ;
  // cinq chiffres purs se retrouvent dans n'importe quelle URL (identifiants de page,
  // cotes, millésimes). La pénalité doit suffire à faire basculer en doute.
  'numeric-short': 22,
  // Une référence d'ORIGINE désigne la pièce que l'article remplace, pas l'article : deux
  // équivalents d'une même pièce d'origine ne sont pas forcément interchangeables. La
  // pénalité doit suffire à faire tomber en doute dès qu'un second défaut s'y ajoute.
  'origin-key': 25,
  contested: 20,
  'price-gulf': 15,
  // Cas VÉCU : « FILTRE A AIR » à 11,42 € apparié à « Démarreur KOHLER 4109806S » à
  // 469,90 € — +4 015 %. L'écart de marge grossiste → détail explique un facteur 2 ou 3,
  // un lot de dix explique un facteur 10 ; rien n'explique un facteur 40. La pénalité doit
  // faire tomber en doute toute preuve INDIRECTE, sans condamner un code-barres déclaré
  // des deux côtés (98 − 45 = 53, « à vérifier ») : là, c'est le prix qui est suspect.
  'price-abyss': 45,
  // Deux natures de pièce nommées et incompatibles. Même barème que le code-barres
  // contredit : c'est le plus fort démenti qu'un libellé puisse porter. Sans forçage de
  // bande pour autant — un GTIN identique des deux côtés reste plus probant qu'un titre
  // marchand, et retombe en « à vérifier » plutôt qu'en « douteux ».
  'family-conflict': 45,
  // Le seul démenti qui porte sur les OBJETS et non sur des chaînes de caractères. Même
  // barème que les deux autres contradictions fortes. ⚠ `unclear` ne coûte RIEN : un
  // visuel source remplacé par un logo générique est le cas courant, pas un indice.
  'visual-conflict': 45,
}

/** Seuils de bande. `check` commence sous la valeur de `ref-in-title` : la preuve la plus
 *  faible du jeu appelle une vérification humaine même sans aucune contradiction. */
const SURE_FROM = 80
const CHECK_FROM = 45

/**
 * Écart au-delà duquel deux prix ne décrivent plus le même article. Volontairement HAUT :
 * F1 est grossiste et ces concurrents vendent au détail — un facteur 2 ou 3 est le
 * fonctionnement normal du marché, pas une anomalie. Le bas n'est pas surveillé ici :
 * `comparePrices` écarte déjà tout prix sous −60 % (erreur de parsing présumée).
 */
const PRICE_GULF_PCT = 300

/**
 * Second palier : au-delà, le rapport de prix ne relève plus d'aucune politique
 * commerciale. ×10 laisse la place au cas « je vends l'unité, il vend le lot de dix » ;
 * au-delà, deux articles différents portent la même référence quelque part.
 */
const PRICE_ABYSS_PCT = 900

export interface PairSignals {
  evidence: MatchEvidence
  key: { weak: boolean; origin: boolean }
  /** Valeur de la clé qui a prouvé — sa FORME décide de sa force. */
  keyValue?: string
  sourceEan?: string | null
  listingEan?: string | null
  sourceRef?: string | null
  listingRef?: string | null
  sourceName?: string | null
  listingName?: string | null
  /** Écart de prix du rapport (concurrent − moi, en %). */
  deltaPct?: number | null
  /** Nombre de produits F1 dont l'appariement a été prouvé sur CETTE fiche. */
  contenders?: number
  /**
   * Les AUTRES clés du produit source — celles qui n'ont pas prouvé.
   *
   * Sert à repérer une SECONDE concordance. Deux références distinctes qui se retrouvent
   * toutes deux chez le même concurrent ne s'y trouvent pas par hasard : c'est une preuve
   * indépendante de la première, et de loin le signal le plus fort qu'un appariement
   * indirect puisse produire.
   */
  otherKeys?: string[]
}

/** Preuves lues dans un texte libre ou une adresse, par opposition à un champ d'identité
 *  déclaré (`sku`, `mpn`, `gtin13`) où la valeur ne peut pas être là par hasard. */
const INDIRECT = new Set(['ref-in-url', 'ref-in-title', 'ref-in-name', 'ean-in-url'])

/** Longueur en deçà de laquelle une suite de CHIFFRES ne discrimine plus rien. Sept :
 *  un EAN en fait treize, une référence constructeur numérique sept à dix ; en dessous,
 *  le nombre appartient au bruit des URL et des libellés. */
const NUMERIC_MIN_LEN = 7

function isNumericShort(value?: string): boolean {
  return !!value && /^\d+$/.test(value) && value.length < NUMERIC_MIN_LEN
}

/**
 * La force d'une référence trouvée DANS un libellé tient à sa forme, pas seulement à
 * l'endroit où on l'a trouvée. `ref-in-title` part bas parce qu'un nombre croisé au
 * milieu d'un texte libre peut n'être qu'un nombre — mais `322110643/0` retrouvé comme
 * MOT ENTIER dans « Enjoliveur 140mm CASTELGARDEN - GGP 322110643/0 » n'est pas une
 * coïncidence : dix caractères délimités valent la même chose qu'une référence en tête
 * de libellé. Sans cette nuance, des appariements parfaits restaient « à vérifier » à
 * vie, et la bande perdait son sens de file d'attente.
 *
 * Deux barèmes : une suite de chiffres a besoin de plus de longueur qu'une clé mixte
 * pour discriminer (les URL et les libellés sont pleins de nombres, pas de codes).
 */
const TITLE_STRONG_DIGITS = 8
const TITLE_STRONG_MIXED = 6

function distinctiveInTitle(value?: string): boolean {
  if (!value) return false
  return /^\d+$/.test(value) ? value.length >= TITLE_STRONG_DIGITS : value.length >= TITLE_STRONG_MIXED
}

/** Deux valeurs renseignées de part et d'autre, et différentes ? Une seule absente ne
 *  contredit rien : la plupart des marchands ne publient aucun code-barres. */
function conflict(a: string, b: string): boolean {
  return !!a && !!b && a !== b
}

/**
 * Ce que vaut une SECONDE référence concordante, ajouté au `core` — donc capable de
 * changer la BANDE, contrairement à tous les autres renforts.
 *
 * Ce n'est pas une entorse à la règle « les renforts rassurent, ils ne prouvent pas » :
 * une deuxième référence n'est pas un renfort, c'est une preuve indépendante. Qu'un
 * nombre se retrouve par hasard dans un libellé arrive tous les jours ; que DEUX de nos
 * références distinctes s'y retrouvent ensemble, non.
 *
 * Cas VÉCU, mesuré : « PIGNON ETOILE 6 DENTS » (« Remplace origine: 460663, 538243909 »)
 * apparié à « Pignon de tronçonneuse 460663 - 538243909 HUSQVARNA » — les deux
 * références y sont, les deux libellés disent « pignon » — était classé DOUTEUX 20. La
 * clé numérique courte et la référence d'origine cumulaient leurs pénalités sur une base
 * déjà rabaissée, et rien ne venait compenser. Un appariement de cette qualité ne doit
 * pas dormir dans la file rouge : elle est faite pour ce qu'il faut vérifier.
 */
const SECOND_KEY_PROOF = 30

/** Une autre de nos clés figure-t-elle comme MOT ENTIER dans le libellé ou l'adresse du
 *  concurrent ? Mot entier, jamais inclusion : « 4606 » ⊂ « 460663 » ne prouve rien. Et
 *  seulement des clés assez longues pour ne pas coïncider par accident. */
function secondKeyEcho(s: PairSignals): boolean {
  const others = (s.otherKeys ?? []).filter((k) => k && k !== s.keyValue && k.length >= 5)
  if (others.length === 0) return false
  const haystack = `${s.listingName ?? ''} ${s.listingRef ?? ''}`.toUpperCase()
  const tokens = new Set(haystack.split(/[^A-Z0-9]+/).filter(Boolean))
  return others.some((k) => tokens.has(k.toUpperCase()))
}

export function scorePair(s: PairSignals): Confidence {
  const doubts: DoubtReason[] = []
  const supports: SupportReason[] = []

  const sEan = normalizeEan(s.sourceEan)
  const lEan = normalizeEan(s.listingEan)
  const sRef = normalizeRef(s.sourceRef)
  const lRef = normalizeRef(s.listingRef)

  if (conflict(sEan, lEan)) doubts.push('ean-conflict')
  // Une référence contredite ne pèse que si ce n'est PAS elle qui a prouvé l'appariement :
  // quand la preuve vient du champ `sku`, les deux valeurs sont égales par construction.
  if (s.evidence !== 'sku' && s.evidence !== 'mpn' && conflict(sRef, lRef)) doubts.push('ref-conflict')
  if (s.key.weak) doubts.push('weak-key')
  if (isNumericShort(s.keyValue) && INDIRECT.has(s.evidence)) doubts.push('numeric-short')
  if (s.key.origin) doubts.push('origin-key')
  if ((s.contenders ?? 1) > 1) doubts.push('contested')
  // Un seul des deux paliers : cumuler « écart » et « gouffre » compterait deux fois le
  // même fait, et l'infobulle dirait deux fois la même chose.
  if (s.deltaPct != null && s.deltaPct > PRICE_ABYSS_PCT) doubts.push('price-abyss')
  else if (s.deltaPct != null && s.deltaPct > PRICE_GULF_PCT) doubts.push('price-gulf')
  // ⚠ Ce n'est PAS un raisonnement sur les mots communs (cf. l'en-tête du fichier) : on
  // ne déclare rien tant que les deux libellés ne nomment pas chacun une nature de pièce.
  // Deux natures nommées et disjointes, c'est un démenti, pas un défaut de recoupement.
  if (familiesConflict(s.sourceName, s.listingName)) doubts.push('family-conflict')

  if (sEan && sEan === lEan) supports.push('ean-echo')
  if (sRef && sRef === lRef) supports.push('ref-echo')
  const common = sharedTokens(s.sourceName, s.listingName)
  if (common > 0) supports.push('title-echo')

  // La BANDE se décide sur les seules preuves et contradictions. Les renforts affinent
  // ensuite le score À L'INTÉRIEUR de la bande, sans jamais en faire franchir la borne :
  // ils rassurent, ils ne prouvent pas. Sans ce plafond, deux mots de libellé en commun
  // suffiraient à blanchir un appariement dont la clé est faible ET indirecte.
  // La force d'une preuve tient au CHEMIN *et* à la forme de la clé. Un token entier
  // trouvé dans un slug est solide quand la clé est « 3256000773 » ; la même règle sur
  // « 11036 » ne vaut pas mieux qu'un nombre croisé au milieu d'un libellé. On ne part
  // donc jamais du niveau « acquis » dans ce cas — empiler un malus sur une base haute
  // laissait le CIRCLIP Gutbrod apparié à un filtre Toyota au-dessus de la barre du doute.
  // Symétrique de la règle du dessus : une clé DISTINCTIVE retrouvée comme mot entier
  // dans le libellé monte au niveau « référence en tête de libellé ». Les deux cas sont
  // exclusifs par construction (`numeric-short` exige moins de 7 chiffres, la promotion
  // au moins 8) — l'ordre du ternaire ne fait que le rendre lisible.
  let core = doubts.includes('numeric-short')
    ? Math.min(BASE[s.evidence], BASE['ref-in-title'])
    : s.evidence === 'ref-in-title' && distinctiveInTitle(s.keyValue)
      ? BASE['ref-in-name']
      : BASE[s.evidence]
  for (const d of doubts) core -= PENALTY[d]

  // ⚠ Ajouté au CORE, pas au bonus : c'est ce qui lui donne le pouvoir de remonter la
  // bande. Volontairement appliqué APRÈS les pénalités — il ne les efface pas, il les
  // contrebalance : une réf d'origine reste une correspondance indirecte, et le dire
  // encore avec un second témoin serait nier ce que le badge « ORIGINE » annonce.
  if (secondKeyEcho(s)) {
    supports.push('second-key')
    core += SECOND_KEY_PROOF
  }

  let bonus = 0
  if (supports.includes('ean-echo')) bonus += 8
  if (supports.includes('ref-echo')) bonus += 5
  bonus += Math.min(common, 2) * 5

  return finalize(core, bonus, doubts, supports)
}

/** Bande et score à partir des rouages. Isolé pour que `withVisual` rejoue exactement le
 *  même calcul plutôt que d'en tenir une seconde copie qui divergerait. */
function finalize(core: number, bonus: number, doubts: DoubtReason[], supports: SupportReason[]): Confidence {
  const band: ConfidenceBand = doubts.includes('ean-conflict')
    ? 'doubt' // un code-barres contredit ne se rachète par aucun renfort
    : core >= SURE_FROM ? 'sure' : core >= CHECK_FROM ? 'check' : 'doubt'
  const ceiling = band === 'sure' ? 100 : band === 'check' ? SURE_FROM - 1 : CHECK_FROM - 1
  const score = Math.max(0, Math.min(ceiling, Math.round(core + bonus)))
  return { score, band, doubts, supports, raw: { core, bonus } }
}

/** Renfort apporté par deux photos jugées identiques. Volontairement modeste : deux
 *  filtres noirs ronds se ressemblent sans porter la même référence. */
const VISUAL_ECHO_BONUS = 8

/**
 * Réévalue un indice une fois le verdict des PHOTOS connu.
 *
 * Pourquoi à part, et pas dans `scorePair` : les verdicts visuels sont lus par un autre
 * chemin et arrivent APRÈS l'appariement. Les injecter en amont obligerait à relancer
 * `pairSiteListings` — une passe en O(produits) sur des dizaines de milliers de lignes —
 * à chaque fois qu'ils tombent. Ici le recoud coûte une soustraction par ligne.
 *
 * Asymétrie assumée, conforme à la règle du fichier :
 *   - `different` est une CONTRADICTION observée sur les objets eux-mêmes → il retranche,
 *     et peut faire changer de bande ;
 *   - `same` n'est qu'un renfort → il monte le score À L'INTÉRIEUR de sa bande. Deux
 *     photos qui se ressemblent ne prouvent pas une référence ;
 *   - `unclear` ne fait rien : un visuel source remplacé par un logo générique est le cas
 *     ordinaire, pas un indice.
 */
export function withVisual(c: Confidence, verdict: VisualCall): Confidence {
  if (verdict === 'unclear') return c
  if (verdict === 'same') {
    if (c.supports.includes('visual-echo')) return c
    return finalize(c.raw.core, c.raw.bonus + VISUAL_ECHO_BONUS, c.doubts, [...c.supports, 'visual-echo'])
  }
  if (c.doubts.includes('visual-conflict')) return c
  return finalize(c.raw.core - PENALTY['visual-conflict'], c.raw.bonus, [...c.doubts, 'visual-conflict'], c.supports)
}

/** Mots significatifs partagés par les deux libellés, hors nombres — un même chiffre de
 *  cote se retrouve partout et ne rapproche rien. */
function sharedTokens(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0
  const left = new Set(nameTokens(a).filter((t) => !/^\d+$/.test(t)))
  if (left.size === 0) return 0
  let n = 0
  for (const t of new Set(nameTokens(b))) if (left.has(t)) n++
  return n
}
