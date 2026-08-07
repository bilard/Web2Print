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

/**
 * Niveaux de taxonomie, du plus large au plus fin. Alias DISJOINTS : « sous-famille » ne
 * doit jamais être capté comme famille, sinon deux niveaux pointent la même colonne.
 *
 * ⚠ L'UNIVERS a son propre niveau depuis que le catalogue F1 en porte un (2026-08). Rangé
 * avec « famille », il faisait perdre la racine de l'arbre en silence : un seul des deux
 * était retenu, et l'écran « Concurrents » affichait une taxonomie décapitée.
 */
export const TAXO_LEVELS: { label: string; aliases: string[] }[] = [
  { label: 'Univers', aliases: ['univers', 'universe', 'rayon', 'secteur', 'domaine'] },
  { label: 'Famille', aliases: ['famille', 'family', 'famillearticle', 'categorie', 'category'] },
  { label: 'Sous-famille', aliases: ['sousfamille', 'soussfamille', 'sousfamilledesc', 'subfamily', 'webgroupdesc', 'webgroup', 'groupeweb'] },
  { label: 'Groupe produit', aliases: ['productgroup', 'productgroupdesc', 'groupeproduit', 'groupearticle', 'sousgroupe'] },
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

/** Un en-tête revendiqué par un AUTRE niveau que celui qu'on est en train de servir : une
 *  recherche par inclusion doit s'en abstenir. Sans cette garde, « SOUS FAMILLE » contient
 *  « famille » et se fait capter comme famille dès que la vraie colonne FAMILLE manque. */
function claimedElsewhere(form: string, level: number): boolean {
  return TAXO_LEVELS.some((l, i) => i !== level && l.aliases.some((a) => form.includes(a)))
}

/** Une colonne par niveau : égalité stricte d'abord sur TOUS les niveaux, inclusion ensuite
 *  pour ceux restés vides. L'ordre des passes évite qu'un alias large prenne la colonne
 *  d'un niveau plus fin simplement parce qu'il est examiné en premier. */
function pickTaxoLevels(headers: HeaderLike[], taken: Set<string>): string[] {
  const folded = headers.map((h) => ({ key: h.key, forms: [foldHeaderName(h.key), ...(h.label ? [foldHeaderName(h.label)] : [])] }))
  const hit: (string | undefined)[] = TAXO_LEVELS.map(() => undefined)
  for (const exact of [true, false]) {
    TAXO_LEVELS.forEach((level, i) => {
      if (hit[i]) return
      for (const a of level.aliases) {
        const found = folded.find((h) => !taken.has(h.key) && h.forms.some((f) =>
          exact ? f === a : f.includes(a) && !claimedElsewhere(f, i)))
        if (found) { taken.add(found.key); hit[i] = found.key; return }
      }
    })
  }
  return hit.filter((k): k is string => !!k)
}

/** Colonnes SAISIES dans le node, dans l'ordre saisi. Séparateurs `>`, `|`, `,` ou saut de
 *  ligne ; la correspondance est tolérante (casse, accents, tirets). Un nom qui ne désigne
 *  aucune colonne est ignoré — mieux vaut trois niveaux justes que quatre dont un fantôme. */
function taxoFromConfig(headers: HeaderLike[], raw: string): string[] {
  const wanted = raw.split(/[>|,\n]/).map((s) => foldHeaderName(s)).filter(Boolean)
  const out: string[] = []
  for (const w of wanted) {
    const hit = headers.find((h) => !out.includes(h.key)
      && (foldHeaderName(h.key) === w || (h.label != null && foldHeaderName(h.label) === w)))
    if (hit) out.push(hit.key)
  }
  return out
}

/**
 * Ordonne les niveaux DÉTECTÉS du plus large au plus fin d'après les données elles-mêmes,
 * et écarte ceux qui ne sont jamais renseignés.
 *
 * Aucun dictionnaire ne peut savoir si « PRODUCTGROUP » se range au-dessus ou au-dessous
 * de « SOUS FAMILLE » : cela dépend de l'ERP, et se tromper inverse l'arbre entier. Le
 * fichier, lui, le dit sans ambiguïté — un niveau qui en contient un autre a forcément
 * moins de valeurs distinctes. Une colonne vide partout est retirée : `taxoPathOf`
 * s'arrêterait dessus et renverrait tout le catalogue en « non classé ».
 */
function orderByGranularity(keys: string[], rows: Record<string, unknown>[]): string[] {
  if (keys.length === 0 || rows.length === 0) return keys
  // Échantillon borné : la hiérarchie se lit sur quelques milliers de lignes, la mesurer
  // sur 200 000 coûterait plus cher que tout le reste de la résolution de colonnes.
  const step = Math.max(1, Math.floor(rows.length / 5000))
  const distinct = new Map(keys.map((k) => [k, new Set<string>()]))
  for (let i = 0; i < rows.length; i += step) {
    for (const k of keys) {
      const v = rows[i][k] == null ? '' : String(rows[i][k]).trim()
      if (v) distinct.get(k)!.add(v)
    }
  }
  return keys
    .map((key, rank) => ({ key, rank, n: distinct.get(key)!.size }))
    .filter((c) => c.n > 0)
    // À égalité (une taxonomie plate, ou un échantillon trop court), l'ordre du
    // dictionnaire tranche : il reste la meilleure hypothèse disponible.
    .sort((a, b) => a.n - b.n || a.rank - b.rank)
    .map((c) => c.key)
}

/**
 * Résout les colonnes d'affichage d'une feuille source. `configured` (saisi dans le node)
 * prime quand il désigne une colonne existante — deviner ne rattrape que ce qui pointait
 * dans le vide. `rows`, quand elles sont fournies, arbitrent l'ORDRE des niveaux de
 * taxonomie et écartent les colonnes vides.
 */
export function pickDisplayColumns(
  headers: HeaderLike[],
  configured: { description?: string; taxo?: string } = {},
  rows: Record<string, unknown>[] = [],
): DisplayColumns {
  const taken = new Set<string>()
  const known = new Set(headers.map((h) => h.key))
  const asked = (configured.description ?? '').trim()
  const description = asked && known.has(asked) ? asked : pick(headers, DESCRIPTION, taken)
  if (description) taken.add(description)
  const image = pick(headers, IMAGE, taken)
  // Hiérarchie saisie = hiérarchie voulue : ni réordonnancement ni retrait automatique.
  // C'est la seule façon de charger une taxonomie qu'aucun dictionnaire ne connaît.
  const declared = taxoFromConfig(headers, configured.taxo ?? '')
  return {
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
    taxo: declared.length > 0 ? declared : orderByGranularity(pickTaxoLevels(headers, taken), rows),
  }
}

/**
 * Chemin taxonomique d'une ligne. Démarre au premier niveau RENSEIGNÉ, puis s'arrête au
 * premier vide : « Famille > (vide) > Groupe » créerait un nœud fantôme regroupant des
 * produits sans rapport, tandis qu'un niveau de tête absent (un UNIVERS rempli sur une
 * partie du fichier seulement) ne doit pas renvoyer la ligne en « non classé ».
 */
export function taxoPathOf(row: Record<string, unknown>, keys: string[]): string[] {
  const out: string[] = []
  for (const k of keys) {
    const v = row[k] == null ? '' : String(row[k]).trim()
    if (!v) { if (out.length > 0) break; continue }
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
