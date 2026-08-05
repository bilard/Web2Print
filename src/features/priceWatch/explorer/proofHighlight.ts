// Où se trouve, concrètement, la valeur qui a prouvé l'appariement. PUR.
//
// Le badge dit « EAN » ou « RÉF » ; il ne dit pas OÙ. Sur une fiche concurrent qui
// n'affiche aucun code-barres, « EAN » laisse l'acheteur chercher un chiffre qui n'est
// nulle part — il est dans le slug de l'URL. Ce module rend la preuve visible à
// l'endroit exact où elle se lit, ou nomme l'endroit quand il n'est pas affiché.
import { normalizeRef, normalizeEan, stripLeadingZeros } from '../catalog/keys'

/** Un morceau de texte, marqué ou non comme portant la preuve. */
export interface Segment {
  text: string
  hit: boolean
}

/** Deux formes désignent-elles la même clé ? Les catalogues écrivent la même référence
 *  de trois façons (`325600077/3`, `3256000773`, `0003256000773`) — comparer les chaînes
 *  brutes ne trouverait aucune des trois. */
function sameKey(candidate: string, key: string, isEan: boolean): boolean {
  if (!candidate || !key) return false
  const norm = isEan ? normalizeEan(candidate) : normalizeRef(candidate)
  if (!norm) return false
  return norm === key || stripLeadingZeros(norm) === stripLeadingZeros(key)
}

/**
 * Découpe un libellé en segments, en marquant les mots dont la forme normalisée est la
 * clé. Découpage sur les blancs et la ponctuation de séparation, en CONSERVANT les
 * séparateurs : le libellé doit se relire à l'identique une fois recomposé.
 */
export function highlightKey(text: string, key: string, isEan = false): Segment[] {
  if (!text) return []
  if (!key) return [{ text, hit: false }]
  const parts = text.split(/(\s+|[|,;·])/)
  const out: Segment[] = []
  for (const part of parts) {
    // Un mot peut porter la clé collée à de la ponctuation de bord (« (4911070) »).
    const trimmed = part.replace(/^[^\w/-]+|[^\w/-]+$/g, '')
    const hit = sameKey(trimmed, key, isEan) || sameKey(part, key, isEan)
    // Segments consécutifs de même nature fusionnés : sans cela, un titre produit
    // quarante <span> pour rien.
    const last = out[out.length - 1]
    if (last && last.hit === hit) last.text += part
    else out.push({ text: part, hit })
  }
  return out
}

/** Endroits possibles d'une preuve chez le concurrent, dans l'ordre de `proveMatch`. */
export type ProofSpot = 'gtin' | 'ref' | 'name' | 'url'

/** Où la preuve se lit, d'après la nature de l'evidence. `url` = nulle part à l'écran :
 *  la valeur est dans l'adresse de la fiche, il faut le DIRE plutôt que laisser chercher. */
export function proofSpot(evidence: string): ProofSpot {
  if (evidence === 'gtin13') return 'gtin'
  if (evidence === 'sku' || evidence === 'mpn') return 'ref'
  if (evidence === 'ref-in-name' || evidence === 'ref-in-title') return 'name'
  return 'url'
}
