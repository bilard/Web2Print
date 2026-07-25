// src/features/priceWatch/catalog/categoryTargeting.ts
// Ciblage des catégories d'un concurrent par APPARIEMENT DE VOCABULAIRES. PUR.
//
// Le filtre historique (categories.ts) traduit une famille source en mots-clés attendus
// dans le slug du concurrent : « COURROIES » → `courroie`. Il échoue dès que l'autre
// range la même marchandise sous un mot qu'on n'a pas deviné (`/transmission/`), et il
// échoue en SILENCE dans le mauvais sens — aucun mot-clé reconnu = aucun filtre = tout
// le catalogue balayé.
//
// Ici on ne devine rien : au moment d'ouvrir un balayage, la liste RÉELLE des catégories
// du concurrent est déjà en main (sitemap/accueil). On la soumet, avec les libellés RÉELS
// des familles source, à un modèle qui range chaque chemin en trois seaux.
//
// Le classement à trois seaux N'EST PAS cosmétique : il rend la sûreté structurelle au
// lieu de dépendre d'un seuil réglé à la main. On garde `pertinent` ET `incertain` — un
// concurrent 100 % spécialisé voit donc tout son catalogue survivre (au pire en second
// rang), tandis qu'un généraliste perd ce qui est franchement hors sujet (`meuble-vasque`
// face à un catalogue de pièces de motoculture). Un modèle hésitant élargit la moisson,
// il ne la vide jamais.

/** Nombre de chemins soumis au modèle. Au-delà, le prompt devient énorme pour un gain nul :
 *  la découverte est déjà plafonnée à 250 URLs. */
const MAX_PATHS_SUBMITTED = 250

/** Sous ce nombre de catégories, filtrer n'économise rien : on saute l'appel (et son coût). */
export const MIN_PATHS_TO_TARGET = 20

/** Chemin lisible d'une URL (le modèle n'a que faire du domaine, répété 250 fois). */
export function pathOf(url: string): string {
  try { return new URL(url).pathname } catch { return url }
}

/**
 * Prompt d'appariement. Les chemins sont NUMÉROTÉS et la réponse attendue ne contient que
 * des numéros : le modèle ne peut donc pas inventer d'URL, au pire il cite un index hors
 * borne (ignoré au parsing).
 */
export function buildTargetingPrompt(families: string[], urls: string[]): string {
  const paths = urls.slice(0, MAX_PATHS_SUBMITTED).map((u, i) => `${i}. ${pathOf(u)}`).join('\n')
  return (
    `Tu apparies deux vocabulaires métier qui ne se recouvrent pas forcément mot pour mot.\n\n` +
    `FAMILLES DE MON CATALOGUE :\n${families.map((f) => `- ${f}`).join('\n')}\n\n` +
    `CATÉGORIES DU SITE CONCURRENT (numérotées) :\n${paths}\n\n` +
    `Range CHAQUE numéro dans exactement un seau :\n` +
    `- "pertinent" : la catégorie vend visiblement le même type de marchandise qu'une de mes familles, ` +
    `même si les mots diffèrent (« transmission » recouvre « COURROIES »).\n` +
    `- "incertain" : tu ne peux pas trancher (libellé vague, rayon générique, promotions, nouveautés).\n` +
    `- "horsSujet" : la catégorie relève manifestement d'un autre univers de produits.\n\n` +
    `EN CAS DE DOUTE, choisis "incertain" — jamais "horsSujet". Une catégorie écartée à tort ` +
    `ne sera jamais relevée ; une catégorie gardée à tort ne coûte qu'une page.\n\n` +
    `Réponds UNIQUEMENT par du JSON : {"pertinent":[0,3],"incertain":[1],"horsSujet":[2]}`
  )
}

/**
 * Applique la réponse du modèle à la liste d'URLs d'origine.
 *
 * Retourne `null` — et l'appelant garde alors sa liste NON filtrée — si la réponse est
 * illisible ou si elle n'écarte rien d'exploitable. Toute autre issue conserve l'ordre
 * « pertinent d'abord, incertain ensuite » : le budget de pages d'un tick va donc aux
 * catégories les plus prometteuses, même quand le balayage complet finira par tout voir.
 */
export function applyTargeting(raw: string, urls: string[]): string[] | null {
  const parsed = parseJsonLoose(raw)
  return parsed ? applyTargetingBuckets(parsed as TargetingBuckets, urls) : null
}

/** Seaux renvoyés par le modèle : des INDEX dans la liste soumise, jamais des URLs. */
export interface TargetingBuckets {
  pertinent?: unknown
  incertain?: unknown
  horsSujet?: unknown
}

/** Schéma de sortie pour les appels LLM structurés (client : `generateJson`). */
export const TARGETING_SCHEMA_FOR_LLM = {
  type: 'object',
  properties: {
    pertinent: { type: 'array', items: { type: 'integer' } },
    incertain: { type: 'array', items: { type: 'integer' } },
    horsSujet: { type: 'array', items: { type: 'integer' } },
  },
  required: ['pertinent', 'incertain', 'horsSujet'],
} as const

/** Même logique que `applyTargeting`, sur une réponse DÉJÀ désérialisée. */
export function applyTargetingBuckets(parsed: TargetingBuckets, urls: string[]): string[] | null {
  if (!parsed || typeof parsed !== 'object') return null
  const pick = (key: keyof TargetingBuckets): number[] => {
    const v = parsed[key]
    if (!Array.isArray(v)) return []
    return v.map((n) => Math.floor(Number(n))).filter((n) => Number.isInteger(n) && n >= 0 && n < urls.length)
  }
  const relevant = pick('pertinent')
  const unsure = pick('incertain')
  const seen = new Set<number>()
  const kept: string[] = []
  for (const i of [...relevant, ...unsure]) {
    if (seen.has(i)) continue
    seen.add(i)
    kept.push(urls[i])
  }
  // Rien de gardé = réponse inexploitable (ou modèle qui a tout jeté) : on ne vide JAMAIS
  // un plan de moisson sur la foi d'un LLM — c'est exactement le mode d'échec que le
  // filtre par mots-clés avait déjà produit.
  if (kept.length === 0) return null
  // Les chemins non classés (au-delà de MAX_PATHS_SUBMITTED, ou oubliés par le modèle)
  // restent moissonnés, en queue : ne pas les perdre par omission.
  const forgotten = urls.filter((_, i) => !seen.has(i) && i >= MAX_PATHS_SUBMITTED)
  return [...kept, ...forgotten]
}

/** Extrait le premier objet JSON d'une réponse LLM (souvent enrobée de ```json … ```). */
function parseJsonLoose(text: string): unknown {
  const trimmed = (text ?? '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '')
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try { return JSON.parse(trimmed.slice(start, end + 1)) } catch { return null }
}

/**
 * Familles DISTINCTES d'une feuille source, triées par nombre de produits décroissant.
 * Le node Moisson n'a ainsi rien à saisir : le vocabulaire vient de la source elle-même,
 * et il reste juste (une famille marginale ne pèse pas autant qu'une famille massive).
 */
export function familiesFromRows(
  rows: Record<string, unknown>[], column: string, max = 40,
): string[] {
  if (!column) return []
  const counts = new Map<string, number>()
  for (const row of rows ?? []) {
    const raw = row?.[column]
    const value = raw == null ? '' : String(raw).trim()
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([name]) => name)
}
