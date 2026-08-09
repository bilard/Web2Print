// Arbre de taxonomie F1 construit sur une liste de CHEMINS. PUR.
//
// ⚠ L'arbre ne connaît pas ce qu'il classe : face à un concurrent il reçoit les chemins
// des fiches appariées (une famille qu'il ne vend pas n'a pas à occuper une ligne), en
// vue « Mon catalogue » ceux des produits source. Lui passer des `PairedRow` l'aurait
// enfermé sur le premier usage, et la vue catalogue héritait d'un arbre qui parlait du
// concurrent — un contrôle qui ne pilotait rien.

export interface TaxoNode {
  /** Chemin complet depuis la racine (sert de clé et de valeur de filtre). */
  path: string[]
  label: string
  /** Fiches sous ce nœud, ses descendants compris. */
  count: number
  children: TaxoNode[]
}

/** Fiches sans aucun niveau renseigné : comptées à part, jamais rattachées d'office. */
export interface TaxoTree {
  roots: TaxoNode[]
  /** Nombre de fiches sans chemin (non appariées, ou base sans colonnes de taxonomie). */
  unclassified: number
  total: number
}

interface Mutable { label: string; count: number; children: Map<string, Mutable> }

export function buildTaxoTree(paths: string[][]): TaxoTree {
  const roots = new Map<string, Mutable>()
  let unclassified = 0

  for (const path of paths) {
    if (path.length === 0) { unclassified++; continue }
    let level = roots
    for (const label of path) {
      const node = level.get(label) ?? { label, count: 0, children: new Map() }
      node.count++
      level.set(label, node)
      level = node.children
    }
  }

  const toNodes = (level: Map<string, Mutable>, prefix: string[]): TaxoNode[] =>
    [...level.values()]
      // Le plus fourni d'abord : sur des centaines de familles, l'ordre alphabétique
      // enterre celles qui portent le volume. À égalité, alphabétique pour la stabilité.
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr'))
      .map((n) => {
        const path = [...prefix, n.label]
        return { path, label: n.label, count: n.count, children: toNodes(n.children, path) }
      })

  return { roots: toNodes(roots, []), unclassified, total: paths.length }
}

/** true si `path` est le chemin sélectionné ou l'un de ses descendants. */
export function isUnderPath(path: string[], selected: string[]): boolean {
  return selected.every((v, i) => path[i] === v)
}
