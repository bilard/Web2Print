// Le RÉGIME instantané de la collecte, par site — le compte-tours, pas le compteur
// kilométrique.
//
// ⚠⚠ L'écran ne savait donner que des cumuls : « 1 800 fiches », « débit 89 p/min » depuis
// le début des temps. Deux nombres qui montent lentement et ne redescendent jamais, donc
// incapables de répondre à la seule question qu'on se pose devant un run : « est-ce que ça
// avance MAINTENANT ? ». Un site à l'arrêt depuis vingt minutes affiche exactement les
// mêmes chiffres qu'un site en pleine collecte.
//
// On mesure donc ce que le serveur n'envoie pas : la DÉRIVÉE. Chaque écho Firestore est
// horodaté et empilé ; le régime est la pente sur la fenêtre récente. Rien à changer côté
// serveur, et aucune valeur inventée — deux échos identiques donnent zéro, ce qui est la
// vérité.

/** Un relevé : ce que le site affichait à cet instant. */
export interface RateSample {
  at: number
  products: number
  pages: number
}

/**
 * Fenêtre de mesure. Assez large pour absorber le rythme des échos (une écriture de méta
 * toutes les quinze pages côté cron), assez courte pour qu'un arrêt se voie en moins d'une
 * minute.
 */
export const RATE_WINDOW_MS = 90_000

/** Au-delà, plus rien n'écrit : le site est à l'arrêt, quoi qu'en disent les cumuls. */
export const IDLE_AFTER_MS = 180_000

/** Sous ce délai, le site travaille sous nos yeux. */
const FRESH_MS = 45_000

type Pulse = 'live' | 'slow' | 'idle'

export interface LiveRate {
  /** Fiches par minute sur la fenêtre — 0 si rien n'a bougé, jamais `null` par confort. */
  productsPerMin: number
  pagesPerMin: number
  /** Depuis quand le dernier changement RÉEL de compteur, en ms. `null` = jamais vu bouger. */
  sinceChangeMs: number | null
  pulse: Pulse
}

/**
 * Empile un relevé et purge ce qui sort de la fenêtre.
 *
 * ⚠ Un relevé n'est retenu que si un compteur a CHANGÉ, ou s'il est le premier. Firestore
 * réémet le même document à chaque écriture voisine ; empiler ces doublons ferait tomber la
 * pente à zéro alors que la collecte tourne — le compte-tours retomberait au ralenti entre
 * deux pages.
 */
export function pushSample(history: RateSample[], next: RateSample): RateSample[] {
  const last = history[history.length - 1]
  const changed = !last || last.products !== next.products || last.pages !== next.pages
  const kept = changed ? [...history, next] : history
  return kept.filter((s) => next.at - s.at <= RATE_WINDOW_MS * 2)
}

/**
 * Régime déduit d'un historique. PUR.
 *
 * `beatAt` est le battement de MOISSON écrit par le serveur : il tranche le cas où rien
 * n'a changé parce que le site a fini, versus rien n'a changé parce qu'il est bloqué.
 */
export function rateOf(history: RateSample[], now: number, beatAt?: number): LiveRate {
  const win = history.filter((s) => now - s.at <= RATE_WINDOW_MS)
  const first = win[0]
  const last = win[win.length - 1]
  // Une seule mesure ne fait pas une pente : deux points minimum, et un écart de temps non
  // nul. Sinon on rendrait « +∞ fiches/min » au premier écho.
  const spanMs = first && last ? last.at - first.at : 0
  const perMin = (delta: number): number => (spanMs > 0 ? Math.max(0, Math.round((delta / spanMs) * 60_000)) : 0)
  const productsPerMin = first && last ? perMin(last.products - first.products) : 0
  const pagesPerMin = first && last ? perMin(last.pages - first.pages) : 0

  const lastChangeAt = history.length ? history[history.length - 1].at : undefined
  // Le plus récent des deux signaux : un battement serveur sans changement de compteur
  // reste la preuve que quelqu'un travaille (une page lue sans produit, par exemple).
  const seenAt = Math.max(lastChangeAt ?? 0, beatAt ?? 0)
  const sinceChangeMs = seenAt > 0 ? Math.max(0, now - seenAt) : null

  const pulse: Pulse = sinceChangeMs == null || sinceChangeMs > IDLE_AFTER_MS
    ? 'idle'
    : sinceChangeMs <= FRESH_MS ? 'live' : 'slow'
  return { productsPerMin, pagesPerMin, sinceChangeMs, pulse }
}
