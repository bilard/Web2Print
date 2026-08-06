// Colonnes d'AFFICHAGE du catalogue source : description, visuel, taxonomie. PUR.
//
// Pourquoi ici et pas dans le PIM : le catalogue F1 n'est PAS une base du PIM, c'est le
// fichier branché en entrée du workflow (« Comparer catalogue »). Seul ce node voit ses
// colonnes ; l'explorateur, lui, ne relit que ce qui a été PERSISTÉ. Ces champs voyagent
// donc avec le catalogue source, sans quoi aucun écran ne peut les retrouver.
//
// ⚠ Module DUPLIQUÉ dans functions/src/priceWatch/catalog/ (bundles séparés). Toute
// modification ici doit être reportée là-bas — cf. catalogParity.test.ts.

/** En-tête normalisé : sans accents, minuscules, sans séparateurs. */
function foldHeaderName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

// ⚠ Le TEXTE DE VENTE passe AVANT « description ». Sur les exports ERP qui portent les
// deux, la colonne « DESCRIPTION » recopie le plus souvent le libellé (« PNEU 13 X 500
// X 6 » deux fois de suite à l'écran) tandis que « TEXT_VENTE » porte le vrai argumentaire
// commercial — celui qui permet de trancher « est-ce bien la même pièce ? ». Une feuille
// qui n'a que l'une des deux n'est pas concernée par cet ordre.
const DESCRIPTION = [
  'textvente', 'textevente', 'textedevente', 'texteventeweb',
  'description', 'descriptif', 'desc', 'caracteristiques', 'commentaire',
]
const IMAGE = ['pathphoto', 'photo', 'image', 'visuel', 'img', 'illustration', 'urlimage', 'picture']

/** Niveaux de taxonomie, du plus large au plus fin. Alias DISJOINTS : « sous-famille »
 *  ne doit jamais être capté comme famille, sinon deux niveaux pointent la même colonne. */
const TAXO = [
  ['famille', 'family', 'famillearticle', 'univers', 'rayon', 'categorie', 'category'],
  ['webgroupdesc', 'webgroup', 'sousfamille', 'subfamily', 'groupeweb'],
  ['productgroup', 'productgroupdesc', 'groupeproduit', 'groupearticle', 'sousgroupe'],
]

export interface DisplayColumns {
  description?: string
  image?: string
  /** Une clé par niveau trouvé, dans l'ordre. Les niveaux absents sont omis. */
  taxo: string[]
}

interface HeaderLike { key: string; label?: string }

/**
 * Alias trop GÉNÉRIQUES pour une recherche par inclusion : ils sont contenus dans des
 * en-têtes qui désignent un autre champ. « desc » capturait WEBGROUP_DESC comme colonne
 * de description, et le deuxième niveau de taxonomie disparaissait de l'arbre. Ils
 * restent valides en égalité stricte.
 */
const STRICT_ONLY = new Set(['desc', 'img'])

/** Première colonne dont la clé ou le libellé correspond, égalité stricte d'abord. */
function pick(headers: HeaderLike[], aliases: string[], taken: Set<string>): string | undefined {
  const folded = headers.map((h) => ({ key: h.key, forms: [foldHeaderName(h.key), ...(h.label ? [foldHeaderName(h.label)] : [])] }))
  for (const exact of [true, false]) {
    for (const a of aliases) {
      if (!exact && STRICT_ONLY.has(a)) continue
      const hit = folded.find((h) => !taken.has(h.key) && h.forms.some((f) => (exact ? f === a : f.includes(a))))
      if (hit) { taken.add(hit.key); return hit.key }
    }
  }
  return undefined
}

/**
 * Résout les colonnes d'affichage d'une feuille source. `configured` (saisi dans le node)
 * prime quand il désigne une colonne existante — deviner ne rattrape que ce qui pointait
 * dans le vide.
 */
export function pickDisplayColumns(
  headers: HeaderLike[],
  configured: { description?: string } = {},
): DisplayColumns {
  const taken = new Set<string>()
  const known = new Set(headers.map((h) => h.key))
  const asked = (configured.description ?? '').trim()
  const description = asked && known.has(asked) ? asked : pick(headers, DESCRIPTION, taken)
  if (description) taken.add(description)
  return {
    ...(description ? { description } : {}),
    ...(((k) => (k ? { image: k } : {}))(pick(headers, IMAGE, taken))),
    taxo: TAXO.map((aliases) => pick(headers, aliases, taken)).filter((k): k is string => !!k),
  }
}

/** Chemin taxonomique d'une ligne. S'arrête au premier niveau vide : « Famille > (vide) >
 *  Groupe » créerait un nœud fantôme regroupant des produits sans rapport. */
export function taxoPathOf(row: Record<string, unknown>, keys: string[]): string[] {
  const out: string[] = []
  for (const k of keys) {
    const v = row[k] == null ? '' : String(row[k]).trim()
    if (!v) break
    out.push(v)
  }
  return out
}

/** Description PERSISTÉE : tronquée. Le catalogue source est chunké en documents
 *  Firestore ; des descriptions entières sur 75 000 produits feraient exploser le
 *  nombre de tranches, donc le temps de lecture de l'écran. */
export const DESCRIPTION_MAX = 300

export function trimDescription(v: unknown): string | undefined {
  const s = v == null ? '' : String(v).trim()
  if (!s) return undefined
  return s.length > DESCRIPTION_MAX ? s.slice(0, DESCRIPTION_MAX) + '…' : s
}
