// Lecture du solde de crédits Firecrawl. L'API a changé de forme plusieurs fois
// (v1 / v2 / legacy / billing) et le champ des crédits restants n'est jamais au même
// endroit : on cherche donc RÉCURSIVEMENT le premier nombre dont la clé parle de
// « remain » ou de « credit », plutôt que de coder en dur un chemin qui casse au
// prochain changement d'API. Deux appelants : le test de clé (Réglages) et la carte
// de consommation du panneau live — d'où ce module neutre, sans dépendance.

export interface FirecrawlCredits {
  /** Crédits encore disponibles, ou undefined si la réponse n'en parle pas. */
  remaining?: number
  /** Crédits du plan (dénominateur), quand l'API le donne. */
  total?: number
}

const MAX_DEPTH = 6

/** En dessous, la réserve ne tient plus une passe de moisson : le test de clé comme la
 *  carte de consommation doivent alerter au MÊME seuil, sinon l'un rassure quand l'autre
 *  s'inquiète. */
export const FIRECRAWL_LOW_CREDITS = 50

/** Extrait `remaining`/`total` de n'importe quelle forme de réponse `credit-usage`.
 *  Profondeur bornée : une structure profonde ou circulaire ne doit pas figer l'UI. */
export function parseFirecrawlCredits(json: unknown, depth = 0): FirecrawlCredits {
  if (depth > MAX_DEPTH || !json || typeof json !== 'object') return {}
  const o = json as Record<string, unknown>
  let remaining: number | undefined
  let total: number | undefined
  for (const [key, val] of Object.entries(o)) {
    if (typeof val === 'number') {
      const k = key.toLowerCase()
      if (/remain/.test(k) && remaining === undefined) remaining = val
      else if (/^plan|^total|allow|limit/.test(k) && /credit/.test(k) && total === undefined) total = val
      // Un champ « credits » nu vaut pour le restant — sauf s'il compte le CONSOMMÉ,
      // qu'on prendrait alors pour un solde (et un compte à sec passerait pour plein).
      else if (/credit/.test(k) && remaining === undefined && !/used|consumed|spent/.test(k)) remaining = val
    }
  }
  if (remaining !== undefined || total !== undefined) return { remaining, total }
  for (const val of Object.values(o)) {
    if (val && typeof val === 'object') {
      const sub = parseFirecrawlCredits(val, depth + 1)
      if (sub.remaining !== undefined || sub.total !== undefined) return sub
    }
  }
  return {}
}
