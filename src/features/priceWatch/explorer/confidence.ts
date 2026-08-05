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

/** Trois bandes seulement : agir, vérifier, laisser. Une échelle plus fine ne se lit pas. */
export type ConfidenceBand = 'sure' | 'check' | 'doubt'

/** Motif de DOUTE — chacun est une contradiction observée, jamais une absence. */
export type DoubtReason =
  | 'ean-conflict'   // les deux publient un code-barres, et ils diffèrent
  | 'ref-conflict'   // les deux publient une référence structurée, et elles diffèrent
  | 'weak-key'       // la clé qui prouve est courte : collision plausible
  | 'origin-key'     // correspondance indirecte (réf. d'origine citée), pas la pièce elle-même
  | 'contested'      // plusieurs produits F1 revendiquent cette même fiche
  | 'price-gulf'     // prix sans commune mesure avec le mien

/** Motif de RENFORT — ne peut que faire monter le score, jamais changer de bande. */
type SupportReason = 'title-echo' | 'ean-echo' | 'ref-echo'

export interface Confidence {
  score: number
  band: ConfidenceBand
  doubts: DoubtReason[]
  supports: SupportReason[]
}

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
  // Une référence d'ORIGINE désigne la pièce que l'article remplace, pas l'article : deux
  // équivalents d'une même pièce d'origine ne sont pas forcément interchangeables. La
  // pénalité doit suffire à faire tomber en doute dès qu'un second défaut s'y ajoute.
  'origin-key': 25,
  contested: 20,
  'price-gulf': 15,
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

export interface PairSignals {
  evidence: MatchEvidence
  key: { weak: boolean; origin: boolean }
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
}

/** Deux valeurs renseignées de part et d'autre, et différentes ? Une seule absente ne
 *  contredit rien : la plupart des marchands ne publient aucun code-barres. */
function conflict(a: string, b: string): boolean {
  return !!a && !!b && a !== b
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
  if (s.key.origin) doubts.push('origin-key')
  if ((s.contenders ?? 1) > 1) doubts.push('contested')
  if (s.deltaPct != null && s.deltaPct > PRICE_GULF_PCT) doubts.push('price-gulf')

  if (sEan && sEan === lEan) supports.push('ean-echo')
  if (sRef && sRef === lRef) supports.push('ref-echo')
  const common = sharedTokens(s.sourceName, s.listingName)
  if (common > 0) supports.push('title-echo')

  // La BANDE se décide sur les seules preuves et contradictions. Les renforts affinent
  // ensuite le score À L'INTÉRIEUR de la bande, sans jamais en faire franchir la borne :
  // ils rassurent, ils ne prouvent pas. Sans ce plafond, deux mots de libellé en commun
  // suffiraient à blanchir un appariement dont la clé est faible ET indirecte.
  let core = BASE[s.evidence]
  for (const d of doubts) core -= PENALTY[d]
  const band: ConfidenceBand = doubts.includes('ean-conflict')
    ? 'doubt' // un code-barres contredit ne se rachète par aucun renfort
    : core >= SURE_FROM ? 'sure' : core >= CHECK_FROM ? 'check' : 'doubt'

  let score = core
  if (supports.includes('ean-echo')) score += 8
  if (supports.includes('ref-echo')) score += 5
  score += Math.min(common, 2) * 5

  const ceiling = band === 'sure' ? 100 : band === 'check' ? SURE_FROM - 1 : CHECK_FROM - 1
  score = Math.max(0, Math.min(ceiling, Math.round(score)))
  return { score, band, doubts, supports }
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
