// functions/src/workflow/fitRunDoc.ts
// ⚠ COPIE de src/features/workflows/persistence/fitRunDoc.ts (bundles séparés).
// Faire TENIR un snapshot de run sous la limite d'un document Firestore. PUR.
//
// Cas VÉCU, en production, sur un run serveur : le document pesait 2 808 947 octets pour
// une limite de 1 048 576. L'écriture jetait, le scheduler la relayait dans son catch, et
// le run — qui avait ABOUTI — était enregistré « error », son statut final jamais publié
// et son checkpoint effacé. Autrement dit : un run réussi devenait un run raté, et l'écran
// ne pouvait plus dire s'il était terminé.
//
// Pourquoi le plafond existant n'a pas suffi : il compte des LIGNES (100 par port), pas des
// OCTETS. Cent lignes d'un catalogue enrichi — descriptions réécrites, HTML d'un mail de
// veille, tableaux de specs — pèsent des mégaoctets. Même piège que le découpage du
// catalogue source par nombre plutôt que par taille.
//
// La réduction est PROGRESSIVE et ANNONCÉE : on ne rend jamais un aperçu amputé en silence.

/** Limite dure d'un document Firestore. */
const DOC_LIMIT = 1_048_576

/** Part laissée aux sorties. Le reste du document (logs, états, méta) tient largement
 *  dans ce qui subsiste — et la marge absorbe la surcharge d'encodage Firestore, qui n'est
 *  pas exactement celle de JSON. */
export const OUTPUTS_BUDGET = Math.floor(DOC_LIMIT * 0.66)

/** Longueur au-delà de laquelle une cellule est coupée à la première réduction. Un texte
 *  de vente ou un bloc HTML dépasse toujours ; une référence, un prix, un libellé, jamais. */
const LONG_CELL = 400

/** Paliers de lignes conservées par port, du plus généreux au plus strict. */
const ROW_STEPS = [100, 20, 5, 0]

export function utf8Len(value: unknown): number {
  try { return new TextEncoder().encode(JSON.stringify(value) ?? '').length } catch { return 0 }
}

type Ports = Record<string, unknown>
type Outputs = Record<string, Ports>

function cutLongStrings(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > LONG_CELL ? `${value.slice(0, LONG_CELL)}…` : value
  }
  if (Array.isArray(value)) return value.map(cutLongStrings)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = cutLongStrings(v)
    return out
  }
  return value
}

/** Applique un palier de lignes, en gardant `totalRows` : sans lui, une feuille de 115 815
 *  lignes se relit comme « 20 lignes » et la volumétrie affichée ment. */
function withRowCap(outputs: Outputs, keep: number): Outputs {
  const out: Outputs = {}
  for (const [nodeId, ports] of Object.entries(outputs)) {
    const capped: Ports = {}
    for (const [port, val] of Object.entries(ports ?? {})) {
      const rows = (val as { rows?: unknown[] } | null)?.rows
      capped[port] = Array.isArray(rows)
        ? { ...(val as object), totalRows: (val as { totalRows?: number }).totalRows ?? rows.length, rows: rows.slice(0, keep) }
        : val
    }
    out[nodeId] = capped
  }
  return out
}

export interface FittedOutputs {
  outputs: Outputs
  /** Ce qui a été sacrifié, en clair — destiné à être écrit DANS le document et lu par
   *  l'écran Résultats. `null` quand rien n'a été touché. */
  trimmed: string | null
}

/**
 * Réduit les sorties jusqu'à tenir sous le budget. Ordre : couper les cellules longues,
 * puis raréfier les lignes, et en dernier recours tout retirer — un run dont on sait qu'il
 * a abouti vaut infiniment mieux qu'un aperçu complet jamais écrit.
 */
export function fitRunOutputs(outputs: Outputs, budget: number = OUTPUTS_BUDGET): FittedOutputs {
  if (utf8Len(outputs) <= budget) return { outputs, trimmed: null }

  const short = cutLongStrings(outputs) as Outputs
  if (utf8Len(short) <= budget) {
    return { outputs: short, trimmed: `textes longs coupés à ${LONG_CELL} caractères` }
  }

  for (const keep of ROW_STEPS) {
    const reduced = withRowCap(short, keep)
    if (utf8Len(reduced) <= budget) {
      return {
        outputs: reduced,
        trimmed: keep > 0
          ? `aperçu réduit à ${keep} ligne(s) par sortie et textes longs coupés`
          : 'lignes retirées de l’aperçu (trop volumineuses)',
      }
    }
  }

  // Même vidées de leurs lignes, les sorties dépassent (métadonnées d'un très grand
  // nombre de ports) : on ne garde plus rien, mais on le DIT.
  return { outputs: {}, trimmed: 'aperçu retiré : sorties trop volumineuses pour être conservées' }
}
