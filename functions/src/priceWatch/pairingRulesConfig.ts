// functions/src/priceWatch/pairingRulesConfig.ts
// ⚠ COPIE PARTIELLE de src/features/priceWatch/pairingRulesConfig.ts (bundles séparés).
// Le serveur ne fait que LIRE une config déjà écrite par l'interface : seul le sens
// config → règles y figure. Les fonctions de saisie (rendu du lexique, config par défaut)
// n'ont pas de sens sans formulaire, et les recopier laisserait du code que rien n'appelle.
// Conversion entre la config du node « Règles d'appariement » (plate, JSON-sérialisable,
// telle que la stocke un workflow) et l'objet `PairingRules` que lit le moteur. PUR.
//
// Pourquoi un module à part : la config d'un node ne peut porter que des scalaires et des
// chaînes — un lexique de familles y devient du texte, une liste de preuves une chaîne
// « a,b,c ». Tout ce transcodage a ses pièges (une case décochée n'est pas une case
// absente), et il doit être testable sans workflow ni Firestore.
import {
  MATCH_EVIDENCES, normalizeFamilyLexicon, resolvePairingRules,
  type FamilyLexicon, type MatchEvidence, type PairingRules,
} from './catalog/pairingRules'

/** Config du node, telle qu'elle vit dans le JSON du workflow. */
export interface PairingRulesConfig {
  watchId: string
  useOriginRefs: boolean
  minRefLen: number
  weakRefLen: number
  /** Preuves ACTIVES, séparées par des virgules (même format que `siteFields`). */
  evidence: string
  familyVeto: boolean
  corroborateNumericKeys: boolean
  unifyDirectedVetoes: boolean
  priceAbyssRatio: number
  /** Lexique additionnel, une famille par ligne : « famille: mot, mot ». */
  extraFamilies: string
  alignedPct: number
  minPriceEur: number
  maxDropPct: number
}

/**
 * Lexique lu depuis la textarea du node. Une ligne = une famille, ses mots séparés par
 * des virgules : `serrure: serrure, verrou, barillet`.
 *
 * Une ligne SANS deux-points est traitée comme une famille dont le premier mot donne le
 * nom — saisir « manchon, raccord » crée donc une famille `manchon` contenant les deux.
 * C'est le geste naturel de quelqu'un qui liste des synonymes, et le refuser en silence
 * serait la pire des réponses.
 */
export function parseFamilyLexicon(text: string): FamilyLexicon {
  const raw: Record<string, string[]> = {}
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf(':')
    const head = idx >= 0 ? trimmed.slice(0, idx) : ''
    const body = idx >= 0 ? trimmed.slice(idx + 1) : trimmed
    const words = body.split(',').map((w) => w.trim()).filter(Boolean)
    if (words.length === 0) continue
    const family = (head.trim() || words[0])
    // Une famille nommée deux fois s'ENRICHIT au lieu de s'écraser : deux lignes qui
    // parlent de la même pièce ne peuvent que vouloir dire la même chose.
    raw[family] = [...(raw[family] ?? []), ...words]
  }
  return normalizeFamilyLexicon(raw)
}

/**
 * Config → règles. Tolérant : une config incomplète (node ajouté par une version
 * antérieure, champ jamais touché) produit les défauts, jamais une règle absurde.
 *
 * ⚠ Une chaîne `evidence` VIDE signifie « aucune preuve cochée », pas « toutes » — sinon
 * décocher la dernière case rendrait silencieusement toutes les preuves. `resolvePairingRules`
 * garde de toute façon `gtin13` armée : on ne peut pas se retrouver sans aucune preuve.
 */
export function configToRules(config: Partial<PairingRulesConfig>): PairingRules {
  const picked = new Set(
    String(config.evidence ?? '').split(',').map((v) => v.trim()).filter(Boolean) as MatchEvidence[],
  )
  const evidence = {} as Record<MatchEvidence, boolean>
  for (const e of MATCH_EVIDENCES) evidence[e] = picked.has(e)
  return resolvePairingRules({
    useOriginRefs: config.useOriginRefs,
    minRefLen: config.minRefLen,
    weakRefLen: config.weakRefLen,
    evidence,
    familyVeto: config.familyVeto,
    corroborateNumericKeys: config.corroborateNumericKeys,
    unifyDirectedVetoes: config.unifyDirectedVetoes,
    priceAbyssRatio: config.priceAbyssRatio,
    extraFamilies: parseFamilyLexicon(config.extraFamilies ?? ''),
    alignedPct: config.alignedPct,
    minPriceEur: config.minPriceEur,
    maxDropPct: config.maxDropPct,
  })
}
