// functions/src/priceWatch/catalog/pairingRules.ts
// ⚠ COPIE de src/features/priceWatch/catalog/pairingRules.ts (bundles séparés).
// Règles d'appariement de la veille tarifaire — le jeu de paramètres qui pilote le
// moteur. PUR : aucune dépendance React/Firebase.
//
// Pourquoi ce module existe. Chaque décision du moteur (quelles clés essayer, quelles
// preuves acceptent un appariement, quels démentis le refusent) était un LITTÉRAL réparti
// sur cinq fichiers — et recopié dans le jumeau serveur. Impossible d'en changer un sans
// toucher au code, ni de savoir après coup quels réglages ont produit un rapport.
//
// ⚠ RÈGLE ABSOLUE — les valeurs par défaut ci-dessous DOIVENT reproduire exactement le
// comportement d'avant ce module. Un réglage jamais touché ne change RIEN. C'est ce qui
// permet de brancher le paramétrage partout sans rejouer la validation terrain de chaque
// constante (14 cellules sur 1 847 pour le veto des familles, 0 sur 1 847 pour le gouffre
// de prix : ces mesures ne valent que pour ces valeurs-là).
//
// PORTÉE v1 : les règles valent pour TOUT un suivi (`watchId`). Pas de dérogation par
// site — c'est un choix, pas un oubli : le terrain le réclamera peut-être (matijardin est
// un piège à faux positifs quand pro-motoculture publie des gtin13 propres), et
// `CompetitorSite` porte déjà des champs par site pour l'accueillir. Le jour venu, ce sera
// une surcouche par siteId au-dessus de ces mêmes règles.

/**
 * Nature de la preuve d'un appariement, de la plus concluante à la plus fragile.
 *
 * ⚠ Déclarée ICI et ré-exportée par `keys.ts` : les règles doivent pouvoir nommer les
 * preuves qu'elles autorisent, et `keys.ts` doit pouvoir lire les règles. Un seul sens
 * d'import évite le cycle.
 */
export type MatchEvidence = 'gtin13' | 'ean-in-url' | 'ref-in-url' | 'sku' | 'mpn' | 'ref-in-name' | 'ref-in-title'

/** Toutes les natures de preuve, dans l'ordre où `proveMatch` les teste. Exporté :
 *  l'écran de réglage en fait ses cases à cocher, et les deux listes ne doivent pas
 *  diverger. */
export const MATCH_EVIDENCES: readonly MatchEvidence[] = [
  'gtin13', 'ean-in-url', 'sku', 'mpn', 'ref-in-name', 'ref-in-url', 'ref-in-title',
]

/** Familles de pièce ajoutées au lexique de base : identifiant → mots qui la nomment.
 *  Une clé déjà connue ENRICHIT la famille existante ; une clé neuve en crée une. */
export type FamilyLexicon = Record<string, string[]>

export interface PairingRules {
  // --- Clés de jointure ---
  /** Utiliser les références d'ORIGINE citées dans la description (« Remplace
   *  origine: … »). Elles apparient une pièce adaptable à la pièce qu'elle remplace :
   *  utile sur un catalogue d'adaptables, discutable ailleurs. */
  useOriginRefs: boolean
  /** Longueur minimale d'une référence exploitable comme clé. */
  minRefLen: number
  /** En deçà, une clé est FAIBLE : elle ne prouve que sur un champ d'identité déclaré
   *  (`sku`/`mpn`), jamais depuis un titre ou une URL. */
  weakRefLen: number

  // --- Preuves acceptées ---
  /** Natures de preuve autorisées. Décocher `ref-in-title` (la plus fragile) réduit le
   *  bruit ET le nombre d'appariés — c'est le réglage le plus rentable du jeu. */
  evidence: Record<MatchEvidence, boolean>

  // --- Démentis (vetos) ---
  /** Refuser un appariement dont les deux libellés nomment des pièces incompatibles. */
  familyVeto: boolean
  /** Familles ajoutées au lexique de base — la connaissance métier que le code ne devine
   *  pas. ⚠ Un mot mal rangé FABRIQUE une contradiction et condamne un appariement juste :
   *  dans le doute, ne pas ajouter le mot. */
  extraFamilies: FamilyLexicon
  /**
   * Rapport de prix au-delà duquel deux articles ne peuvent pas être le même, quoi que
   * dise la référence. Filet UNIVERSEL, complémentaire du lexique : il attrape ce qu'aucun
   * mot connu ne dénonce — cas VÉCU « BAGUE DE ROUE » 1,91 € ↔ « Chaussure de travail
   * GRISPORT » 176,32 €, soit +9 131 %. `0` le désactive.
   *
   * ×21 (le défaut) est volontairement ÉNORME. F1 est grossiste et ces marchands vendent
   * au détail : un facteur 2 ou 3 est le marché normal. Un lot explique davantage —
   * mesuré sur le rapport de production, le pire cas légitime est « COUTEAU » 3,01 € ↔
   * « Couteaux scarificateurs x16 » 41,49 €, soit ×14. Au-delà de vingt-et-un, plus aucun
   * conditionnement ne rend compte de l'écart. Mesure : 0 cellule sur 1 847 touchée, dans
   * les deux sens. ⚠ Le BAISSER se paie en appariements justes perdus.
   *
   * La TVA est ignorée à dessein : mon prix est HT, le sien souvent TTC, et 20 % ne
   * déplacent pas un seuil de 2 100 %.
   */
  priceAbyssRatio: number
  /** Exiger que les libellés se corroborent quand la clé est une suite de CHIFFRES NUS
   *  (qui n'appartient à aucun constructeur). Sans corroboration, ces clés apparient à
   *  l'aveugle — c'est la signature commune des faux relevés du terrain. */
  corroborateNumericKeys: boolean
  /** Appliquer à la recherche dirigée et à la passe Kramp les MÊMES démentis qu'à la
   *  matrice (gouffre de prix + corroboration, et exemption de tout EAN plutôt que du seul
   *  `gtin13` déclaré).
   *
   *  ⚠ Défaut `false` = comportement HISTORIQUE, volontairement conservé. Ces chemins
   *  n'appliquent aujourd'hui que le veto des familles ; les aligner change les chiffres
   *  de production, et c'est une décision à prendre en connaissance de cause, pas un effet
   *  de bord de ce module. */
  unifyDirectedVetoes: boolean

  // --- Prix ---
  /** Bande d'indifférence (%) sous laquelle deux prix sont dits « alignés ». */
  alignedPct: number
  /** Prix concurrent en deçà duquel on présume une erreur de parsing (€). */
  minPriceEur: number
  /** Chute maximale tolérée face au prix source, en % (60 = on rejette au-delà de −60 %).
   *  Même raison : sous ce seuil, le sélecteur du thème a capté autre chose qu'un prix. */
  maxDropPct: number
}

/**
 * Valeurs par défaut = les littéraux historiques, à l'identique.
 * Toute modification ici change le comportement de PRODUCTION de tous les suivis qui
 * n'ont pas de réglage propre. Les chiffres sont commentés à leur point d'usage.
 */
export const DEFAULT_PAIRING_RULES: PairingRules = {
  useOriginRefs: true,
  minRefLen: 3,
  weakRefLen: 5,
  evidence: {
    gtin13: true, 'ean-in-url': true, sku: true, mpn: true,
    'ref-in-name': true, 'ref-in-url': true, 'ref-in-title': true,
  },
  familyVeto: true,
  extraFamilies: {},
  priceAbyssRatio: 21,
  corroborateNumericKeys: true,
  unifyDirectedVetoes: false,
  alignedPct: 1,
  minPriceEur: 1,
  maxDropPct: 60,
}

/** Borne une valeur numérique, en retombant sur le défaut si elle n'est pas exploitable.
 *  Un réglage corrompu (chaîne vide relue de Firestore, `NaN`) ne doit jamais désarmer un
 *  garde-fou en silence : on revient à la valeur qui a été validée sur le terrain. */
function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

/** Lexique nettoyé : familles nommées, mots normalisés (minuscules sans accents, comme
 *  `nameTokens`), entrées vides écartées. Une famille sans mot ne dirait rien. */
export function normalizeFamilyLexicon(raw: unknown): FamilyLexicon {
  if (typeof raw !== 'object' || raw === null) return {}
  const out: FamilyLexicon = {}
  for (const [family, words] of Object.entries(raw as Record<string, unknown>)) {
    const id = String(family).trim().toLowerCase()
    if (!id || !Array.isArray(words)) continue
    const cleaned = [...new Set(words
      .map((w) => String(w).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ''))
      .filter((w) => w.length >= 3))]
    if (cleaned.length > 0) out[id] = cleaned
  }
  return out
}

/**
 * Complète un réglage partiel (relu de Firestore, saisi dans un node) par les défauts.
 * Tolérant par construction : un document ancien, tronqué ou écrit par une version
 * antérieure doit produire un jeu de règles VALIDE, jamais une exception au milieu d'un
 * run d'appariement.
 */
export function resolvePairingRules(partial?: Partial<PairingRules> | null): PairingRules {
  const p = (partial ?? {}) as Record<string, unknown>
  const d = DEFAULT_PAIRING_RULES
  const ev = (typeof p.evidence === 'object' && p.evidence !== null ? p.evidence : {}) as Record<string, unknown>
  const evidence = { ...d.evidence }
  for (const e of MATCH_EVIDENCES) evidence[e] = bool(ev[e], d.evidence[e])
  // `gtin13` n'est PAS désactivable : c'est la seule preuve qu'aucun libellé ne renverse,
  // et s'en priver reviendrait à jeter les appariements certains pour garder les douteux.
  evidence.gtin13 = true
  return {
    useOriginRefs: bool(p.useOriginRefs, d.useOriginRefs),
    minRefLen: Math.round(num(p.minRefLen, d.minRefLen, 2, 12)),
    weakRefLen: Math.round(num(p.weakRefLen, d.weakRefLen, 3, 16)),
    evidence,
    familyVeto: bool(p.familyVeto, d.familyVeto),
    extraFamilies: normalizeFamilyLexicon(p.extraFamilies),
    // 0 = désactivé ; en dessous de 2 le filet refuserait le fonctionnement normal du
    // marché (grossiste → détail, un facteur 2 ou 3 est la norme).
    priceAbyssRatio: p.priceAbyssRatio === 0 ? 0 : num(p.priceAbyssRatio, d.priceAbyssRatio, 2, 1000),
    corroborateNumericKeys: bool(p.corroborateNumericKeys, d.corroborateNumericKeys),
    unifyDirectedVetoes: bool(p.unifyDirectedVetoes, d.unifyDirectedVetoes),
    alignedPct: num(p.alignedPct, d.alignedPct, 0, 50),
    minPriceEur: num(p.minPriceEur, d.minPriceEur, 0, 1000),
    maxDropPct: num(p.maxDropPct, d.maxDropPct, 0, 100),
  }
}

/** Les règles s'écartent-elles des défauts ? Sert à n'ANNONCER un réglage que lorsqu'il
 *  y en a un — un run qui journalise « règles par défaut » à chaque fois ne dit rien. */
export function rulesDifferFromDefault(r: PairingRules): boolean {
  return JSON.stringify(summarizeRules(r)) !== JSON.stringify(summarizeRules(DEFAULT_PAIRING_RULES))
}

/**
 * Résumé STABLE et compact d'un jeu de règles : c'est ce qu'on estampille dans le rapport
 * sauvegardé et ce qu'on journalise. Sans lui, impossible de savoir quels réglages ont
 * produit quels chiffres — et deux rapports deviennent incomparables sans qu'on le sache.
 */
export function summarizeRules(r: PairingRules): Record<string, unknown> {
  const off = MATCH_EVIDENCES.filter((e) => !r.evidence[e])
  return {
    useOriginRefs: r.useOriginRefs,
    minRefLen: r.minRefLen,
    weakRefLen: r.weakRefLen,
    evidenceOff: off,
    familyVeto: r.familyVeto,
    extraFamilies: Object.keys(r.extraFamilies).sort(),
    priceAbyssRatio: r.priceAbyssRatio,
    corroborateNumericKeys: r.corroborateNumericKeys,
    unifyDirectedVetoes: r.unifyDirectedVetoes,
    alignedPct: r.alignedPct,
    minPriceEur: r.minPriceEur,
    maxDropPct: r.maxDropPct,
  }
}
