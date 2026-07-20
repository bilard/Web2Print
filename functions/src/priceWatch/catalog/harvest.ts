// src/features/priceWatch/catalog/harvest.ts
// Moteur de moisson à curseur. PUR : la logique de parcours (quelle page ensuite,
// quand s'arrêter, comment reprendre) ne connaît ni le réseau ni Firestore.
//
// Contrainte de conception issue de l'audit : un tick de cron dispose d'un budget de
// temps borné (~500 s) et DOIT terminer proprement pour que le checkpoint survive.
// La moisson ne se fait donc jamais d'un bloc — chaque tick avale un lot borné de
// pages et avance un curseur persistant. Le run suivant reprend où celui-ci s'est
// arrêté. Un balayage complet = N ticks ; en fin de balayage on reboucle (refresh).

/**
 * Position dans le balayage d'un concurrent. Sérialisable tel quel dans Firestore.
 * `categories` est le PLAN de moisson (URLs de pages liste à parcourir), figé au
 * début d'un balayage pour que la reprise soit déterministe même si le catalogue du
 * concurrent bouge en cours de route.
 */
export interface HarvestCursor {
  categories: string[]
  /** Index de la catégorie en cours. */
  catIndex: number
  /** Page en cours dans cette catégorie (1-based). */
  page: number
  /** Nombre de balayages complets déjà terminés (0 au premier passage). */
  sweeps: number
  /** Le balayage courant est terminé — le prochain tick rouvrira un balayage. */
  done: boolean
}

/** Plafond de pages par catégorie : garde-fou contre une pagination sans fin
 *  (page inexistante renvoyant la page 1). Cohérent avec le node list-products. */
export const MAX_PAGES_PER_CATEGORY = 60

export function initCursor(categories: string[]): HarvestCursor {
  return { categories: [...categories], catIndex: 0, page: 1, sweeps: 0, done: categories.length === 0 }
}

export interface HarvestTarget {
  categoryUrl: string
  page: number
}

/** Page à moissonner maintenant, ou null si le balayage est terminé. */
export function currentTarget(cursor: HarvestCursor): HarvestTarget | null {
  if (cursor.done || cursor.catIndex >= cursor.categories.length) return null
  return { categoryUrl: cursor.categories[cursor.catIndex], page: cursor.page }
}

export interface PageResult {
  /** La page a-t-elle renvoyé au moins un produit ? */
  hadItems: boolean
  /** Une page suivante existe-t-elle (rel="next" détecté) ? */
  hasNext: boolean
}

/**
 * Avance le curseur après le traitement d'une page.
 * - page suivante existante et sous le plafond → page + 1
 * - sinon → catégorie suivante, page 1
 * - plus de catégorie → balayage terminé (le prochain `openSweep` rebouclera)
 *
 * Une page vide clôt la catégorie : une liste paginée ne comporte pas de trou.
 */
export function advance(cursor: HarvestCursor, result: PageResult): HarvestCursor {
  const canPaginate = result.hadItems && result.hasNext && cursor.page < MAX_PAGES_PER_CATEGORY
  if (canPaginate) return { ...cursor, page: cursor.page + 1 }

  const nextCat = cursor.catIndex + 1
  if (nextCat < cursor.categories.length) return { ...cursor, catIndex: nextCat, page: 1 }
  return { ...cursor, catIndex: cursor.categories.length, page: 1, done: true }
}

/**
 * Rouvre un balayage sur un plan éventuellement rafraîchi (le catalogue concurrent a
 * pu changer entre deux passes). Incrémente le compteur de balayages.
 */
export function openSweep(cursor: HarvestCursor, categories: string[]): HarvestCursor {
  return {
    categories: [...categories],
    catIndex: 0,
    page: 1,
    sweeps: cursor.sweeps + (cursor.done ? 1 : 0),
    done: categories.length === 0,
  }
}

/** Progression 0..1 du balayage courant, pour l'affichage. */
export function harvestProgress(cursor: HarvestCursor): number {
  if (cursor.categories.length === 0) return 1
  if (cursor.done) return 1
  return Math.min(1, cursor.catIndex / cursor.categories.length)
}

/**
 * Identifiant Firestore stable d'une page moissonnée. Ré-moissonner la même page
 * réécrit le MÊME doc → rafraîchissement des prix sans accumulation de doublons.
 * Déterministe (pas de hash cryptographique : inutile ici, et indisponible côté
 * navigateur sans async).
 */
export function pageDocId(categoryUrl: string, page: number): string {
  let h = 5381
  const s = `${categoryUrl}#${page}`
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return `p_${(h >>> 0).toString(36)}`
}
