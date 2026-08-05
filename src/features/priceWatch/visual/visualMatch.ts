// Comparaison VISUELLE d'un appariement : les deux photos montrent-elles la même pièce ?
// PUR — prompt, schéma et lecture du verdict. Aucun appel réseau, aucun React.
//
// ── Pourquoi une IA de vision et pas une empreinte perceptuelle ────────────────────
// Le hachage perceptuel (dHash 8×8) a été mesuré sur de vraies vignettes de ce
// catalogue. Il NE SÉPARE PAS :
//
//   jante F1 ↔ jante concurrent (appariement juste)  : 67 %
//   jante F1 ↔ pantalon forestier (aucun rapport)    : 67 %
//   logo « OEM PART » ↔ jante concurrent             : 62 %
//
// Toutes les photos du catalogue sont un objet gris centré sur fond blanc : l'empreinte
// capture le cadrage, commun à tout le catalogue, pas la pièce. Livrer ce nombre aurait
// fait rejeter des appariements justes et valider des faux. Ne pas y revenir sans
// refaire la mesure.
//
// ── Ce que le verdict PEUT et NE PEUT PAS dire ────────────────────────────────────
// Un visuel source est souvent un logo générique (« OEM PART ») ou une photo prise sous
// un autre angle. Deux images différentes ne prouvent donc RIEN — d'où `unclear`, qui
// n'est pas un demi-échec mais le verdict correct dans ces cas. Seul `different`, sur
// deux photos réelles montrant des objets de natures distinctes, est une contradiction.

/** Ce que l'analyse conclut. `unclear` = les images ne permettent pas de trancher. */
type VisualVerdict = 'same' | 'different' | 'unclear'

export interface VisualResult {
  /** Confiance que les deux photos montrent la même pièce, 0-100. */
  score: number
  verdict: VisualVerdict
  /** Une phrase en français : ce que l'analyse a vu. C'est elle qui rend le score auditable. */
  note: string
}

/** Version du prompt — tracée avec chaque résultat : un prompt réécrit change les scores,
 *  et comparer des verdicts produits par deux prompts différents n'a pas de sens. */
export const VISUAL_PROMPT_VERSION = 'pw-visual-1'

export const VISUAL_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'integer', minimum: 0, maximum: 100 },
    verdict: { type: 'string', enum: ['same', 'different', 'unclear'] },
    note: { type: 'string' },
  },
  required: ['score', 'verdict', 'note'],
} as const

/**
 * Le prompt. Deux images sont jointes : la PREMIÈRE est le produit du catalogue source,
 * la SECONDE celle du concurrent. Les libellés accompagnent les images sans les remplacer
 * — ils sont souvent des codes de gestion (« SUB= 1 WAY ») ou dans deux langues.
 */
export function visualPrompt(sourceName: string, listingName: string): string {
  return [
    'Tu compares deux photos de pièces détachées de motoculture pour un acheteur professionnel.',
    'IMAGE 1 = mon produit. IMAGE 2 = le produit d’un concurrent.',
    `Libellé de mon produit : « ${sourceName} »`,
    `Libellé du concurrent : « ${listingName} »`,
    '',
    'Réponds si les deux photos montrent LA MÊME PIÈCE.',
    '',
    'Règles :',
    '- « same » : c’est visiblement la même pièce, même si l’angle, la lumière, le cadrage ou la teinte diffèrent.',
    '- « different » : ce sont des objets de natures différentes (une jante et un pantalon, un filtre et une courroie).',
    '- « unclear » : au moins une image est un logo, un visuel générique, un placeholder, ou est trop imprécise pour juger.',
    '  N’invente jamais un verdict dans ce cas — « unclear » est la bonne réponse.',
    '- score : ta confiance que ce soit la même pièce, de 0 à 100.',
    '- note : UNE phrase courte en français décrivant ce que tu vois de décisif',
    '  (ex. « Jante 3 trous identique, teinte plus claire chez le concurrent »).',
    '  Si le verdict est « unclear », dis pourquoi (ex. « Visuel source remplacé par un logo »).',
    '',
    'Ne te fie pas aux libellés seuls : ils sont parfois rédigés dans deux langues différentes',
    'ou réduits à un code interne. Ce sont les IMAGES qui décident.',
  ].join('\n')
}

/** Borne et nettoie ce que le modèle renvoie — un score hors bornes ou une note vide
 *  passeraient sans bruit jusqu'à l'écran. */
export function normalizeVisual(raw: { score?: unknown; verdict?: unknown; note?: unknown }): VisualResult {
  const n = Number(raw.score)
  const score = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0
  const verdict: VisualVerdict = raw.verdict === 'same' || raw.verdict === 'different' ? raw.verdict : 'unclear'
  const note = typeof raw.note === 'string' ? raw.note.trim().slice(0, 200) : ''
  // Un « same » sans confiance ou un « different » très confiant sont incohérents : le
  // verdict prime, le score est ramené dans sa plage plutôt que d'afficher les deux.
  if (verdict === 'same' && score < 50) return { score: 50, verdict, note }
  if (verdict === 'different' && score > 50) return { score: 50, verdict, note }
  return { score, verdict, note }
}

/** Une paire est-elle analysable ? Sans DEUX images, il n'y a rien à comparer — et
 *  produire un score dans ce cas serait un chiffre inventé. */
export function isComparable(sourceImage?: string | null, listingImage?: string | null): boolean {
  return !!sourceImage && !!listingImage
}
