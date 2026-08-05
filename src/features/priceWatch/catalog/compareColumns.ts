// Résolution des colonnes de « Comparer catalogue » sur la feuille RÉELLEMENT branchée.
// PUR : aucune dépendance React/Firebase.
//
// ⚠ Le piège que ce module supprime. Les colonnes étaient saisies à la main, avec des
// valeurs par défaut (`reference`, `ean`, `price`…) qui ne sont JAMAIS vides. Si la
// feuille source nomme ses en-têtes autrement — « Référence article », « Prix HT », ou
// simplement parce qu'un import les a renommés — la configuration pointe dans le vide :
// aucune clé n'est lue, aucun produit ne s'apparie, et le run réussit sans un mot. C'est
// la panne la plus coûteuse du module : elle ressemble à « le scraping ne marche pas ».
//
// Règle de résolution, dans cet ordre :
//   1. le nom configuré EXISTE dans la feuille → on le garde (le choix explicite prime) ;
//   2. sinon, on DEVINE par index d'alias (fr/en, accents et séparateurs ignorés) ;
//   3. sinon, le champ reste vide — et l'appelant le dit, au lieu de comparer du vide.
//
// Deviner ne masque donc jamais une saisie valide : ça ne rattrape que ce qui pointait
// déjà dans le vide.

/** Colonne d'une feuille : `key` est ce qui indexe les lignes, `label` ce qu'on affiche. */
export interface ColumnLike {
  key: string
  label?: string
}

export type CompareField = 'ref' | 'ref2' | 'ean' | 'name' | 'family' | 'price' | 'description' | 'url'

/** Alias par champ, comparés à la clé ET au libellé normalisés. Ordre = priorité. */
const ALIASES: Record<CompareField, string[]> = {
  ref: ['reference', 'ref', 'sku', 'codearticle', 'codeproduit', 'referencearticle', 'articlecode', 'itemcode', 'partnumber', 'norticle', 'refinterne'],
  ref2: ['reference2', 'ref2', 'articlecode2', 'refsecondaire', 'referencesecondaire', 'refconstructeur', 'referenceconstructeur', 'refoem', 'mpn'],
  ean: ['ean', 'ean13', 'gencod', 'gencode', 'gtin', 'gtin13', 'codebarre', 'codebarres', 'barcode', 'upc'],
  name: ['nom', 'name', 'libelle', 'designation', 'intitule', 'produit', 'article', 'titre', 'title', 'productname'],
  family: ['famille', 'family', 'categorie', 'category', 'univers', 'rayon', 'sousfamille', 'gamme', 'segment'],
  price: ['prixht', 'prixdevente', 'prixvente', 'prixnet', 'montantht', 'tarif', 'prix', 'price', 'pricing', 'pvht', 'pv', 'unitprice'],
  description: ['description', 'descriptif', 'desc', 'detail', 'details', 'caracteristiques', 'commentaire', 'texte'],
  url: ['urlsource', 'urlproduit', 'url', 'lienproduit', 'lien', 'pageproduit', 'producturl', 'link', 'permalink'],
}

/** Normalise un en-tête : sans accents, minuscules, sans séparateurs ni ponctuation. */
export function foldHeader(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Alias trop GÉNÉRIQUES pour une recherche par inclusion : ils sont contenus dans des
 * en-têtes qui désignent un autre champ. « article » capturait « Référence article »
 * comme nom de produit ; « prix » capturerait « Prix barré ». Ils restent valides en
 * égalité stricte — une colonne nommée exactement « Article » EST un nom de produit.
 */
const STRICT_ONLY = new Set(['article', 'produit', 'prix', 'ref', 'pv', 'desc', 'detail'])

/** Colonne dont la clé OU le libellé correspond à l'un des alias, dans l'ordre donné. */
function guess(columns: ColumnLike[], aliases: string[]): string | undefined {
  const folded = columns.map((c) => ({
    key: c.key,
    forms: [foldHeader(c.key), ...(c.label ? [foldHeader(c.label)] : [])],
  }))
  // Égalité stricte d'abord : « prix » ne doit pas être capté par « prixbarre ».
  for (const a of aliases) {
    const hit = folded.find((c) => c.forms.includes(a))
    if (hit) return hit.key
  }
  // Puis inclusion, pour « Prix de vente HT (€) » qui ne sera jamais une égalité — mais
  // seulement avec les alias assez spécifiques pour ne pas capter un autre champ.
  for (const a of aliases) {
    if (STRICT_ONLY.has(a)) continue
    const hit = folded.find((c) => c.forms.some((f) => f.includes(a)))
    if (hit) return hit.key
  }
  return undefined
}

export interface ResolvedColumns {
  /** Clé de colonne retenue par champ (absente = introuvable dans la feuille). */
  columns: Partial<Record<CompareField, string>>
  /** Champs résolus par DEVINAGE (la valeur configurée n'existait pas dans la feuille). */
  guessed: CompareField[]
  /** Champs configurés qui ne pointaient sur RIEN et qu'on n'a pas su deviner. */
  missing: CompareField[]
}

/**
 * Résout les colonnes de comparaison contre la feuille réellement branchée.
 * `configured` porte les noms saisis dans le node (souvent les valeurs par défaut).
 */
export function resolveCompareColumns(
  columns: ColumnLike[],
  configured: Partial<Record<CompareField, string>>,
): ResolvedColumns {
  // Le nom saisi peut désigner la CLÉ ou le LIBELLÉ de la colonne : le sélecteur du node
  // montre le libellé (« PV Brut F1 au 03072026 »), alors que la feuille indexe ses
  // cellules par clé. Ne chercher que la clé rendait ces colonnes introuvables — et un
  // prix source manquant vide TOUTES les comparaisons sans le moindre message.
  const byKey = new Map<string, string>()
  for (const c of columns) {
    byKey.set(c.key, c.key)
    if (c.label && !byKey.has(c.label)) byKey.set(c.label, c.key)
  }
  const out: ResolvedColumns = { columns: {}, guessed: [], missing: [] }
  for (const field of Object.keys(ALIASES) as CompareField[]) {
    const asked = (configured[field] ?? '').trim()
    const resolved = asked ? byKey.get(asked) : undefined
    if (resolved) { out.columns[field] = resolved; continue }
    const found = guess(columns, ALIASES[field])
    if (found) {
      out.columns[field] = found
      // Deviné SANS demande explicite = simple confort ; deviné CONTRE une demande qui
      // pointait dans le vide = rattrapage d'une panne silencieuse. On ne distingue pas
      // ici, mais l'appelant journalise : l'utilisateur doit voir ce qui a été substitué.
      if (asked) out.guessed.push(field)
    } else if (asked) {
      out.missing.push(field)
    }
  }
  return out
}

/** Champs sans lesquels aucun appariement n'est possible (au moins l'un des trois). */
const JOIN_FIELDS: CompareField[] = ['ref', 'ref2', 'ean']

/** true si la feuille n'offre AUCUNE clé de jointure — comparer serait vain. */
export function hasNoJoinKey(r: ResolvedColumns): boolean {
  return JOIN_FIELDS.every((f) => !r.columns[f])
}
