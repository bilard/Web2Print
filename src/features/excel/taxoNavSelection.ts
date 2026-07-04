// src/features/excel/taxoNavSelection.ts
// Modèle PUR de la sélection multi-nœuds du navigateur de taxonomie.
// Une sélection = des CHEMINS de colonnes (chaque chemin = chaîne racine→nœud,
// ex. { level1: 'Plomberie', level2: 'Instruments' }) en UNION entre eux, +
// des nœuds de taxonomie globale (encodés `taxoId::nodeId`) en UNION entre eux.
// Les deux sections se combinent en INTERSECTION (comportement historique).
import { buildGlobalTaxoFilterPredicate } from '@/features/taxonomy/productTaxonomy'
import type { Taxonomy } from '@/features/taxonomy/types'
import type { ExcelRow } from './types'

/** Un chemin de sélection : colKey → valeur, du niveau racine au nœud cliqué. */
export type TaxoNavPath = Record<string, string>

export interface TaxoNavSelection {
  /** Chemins colonne sélectionnés — une ligne matche si elle satisfait AU MOINS UN chemin. */
  paths: TaxoNavPath[]
  /** Nœuds de taxonomie globale (`taxoId::nodeId`) — une ligne matche si AU MOINS UN nœud. */
  globalNodes: string[]
}

export const EMPTY_TAXO_NAV: TaxoNavSelection = { paths: [], globalNodes: [] }

export function hasTaxoNav(sel: TaxoNavSelection): boolean {
  return sel.paths.length > 0 || sel.globalNodes.length > 0
}

export function isSamePath(a: TaxoNavPath, b: TaxoNavPath): boolean {
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  return ka.length === kb.length && ka.every((k) => a[k] === b[k])
}

/** Vrai si `prefix` est un préfixe (au sens ancêtre) de `path` : toutes ses
 * entrées existent dans `path` avec la même valeur, et `path` est plus profond ou égal. */
export function isPathPrefix(prefix: TaxoNavPath, path: TaxoNavPath): boolean {
  return Object.entries(prefix).every(([k, v]) => path[k] === v)
}

/**
 * Toggle d'un chemin : s'il est déjà sélectionné à l'identique → retiré.
 * Sinon ajouté, en retirant ses ancêtres et descendants déjà sélectionnés
 * (sélection non redondante : « Plomberie » puis clic « Instruments » remplace
 * le parent par le chemin complet ; l'inverse re-généralise).
 */
export function togglePath(sel: TaxoNavSelection, path: TaxoNavPath): TaxoNavSelection {
  if (sel.paths.some((p) => isSamePath(p, path))) {
    return { ...sel, paths: sel.paths.filter((p) => !isSamePath(p, path)) }
  }
  const kept = sel.paths.filter((p) => !isPathPrefix(p, path) && !isPathPrefix(path, p))
  return { ...sel, paths: [...kept, path] }
}

/** Toggle d'un nœud de taxonomie globale (encodé `taxoId::nodeId`). */
export function toggleGlobalNode(sel: TaxoNavSelection, encoded: string): TaxoNavSelection {
  return sel.globalNodes.includes(encoded)
    ? { ...sel, globalNodes: sel.globalNodes.filter((g) => g !== encoded) }
    : { ...sel, globalNodes: [...sel.globalNodes, encoded] }
}

function pathMatchesRow(path: TaxoNavPath, row: ExcelRow): boolean {
  return Object.entries(path).every(([colKey, value]) => String(row[colKey]) === value)
}

/** Prédicat ligne de la sélection complète (chemins en OU, global en OU, sections en ET). */
export function buildTaxoNavPredicate(
  sel: TaxoNavSelection,
  taxonomies: Taxonomy[] | undefined,
): (row: ExcelRow) => boolean {
  const globalPreds = sel.globalNodes.map((g) => buildGlobalTaxoFilterPredicate(g, taxonomies))
  return (row) => {
    if (sel.paths.length > 0 && !sel.paths.some((p) => pathMatchesRow(p, row))) return false
    if (globalPreds.length > 0 && !globalPreds.some((pred) => pred(row))) return false
    return true
  }
}

/**
 * Nombre de niveaux de tête (dans l'ordre `orderedColKeys`) où TOUS les chemins
 * sélectionnés portent la même valeur — le groupement par taxonomie peut sauter
 * ces niveaux (ils seraient identiques pour toutes les lignes visibles).
 */
export function commonFilterDepth(sel: TaxoNavSelection, orderedColKeys: string[]): number {
  if (sel.paths.length === 0) return 0
  let depth = 0
  for (const colKey of orderedColKeys) {
    const first = sel.paths[0][colKey]
    if (first === undefined) break
    if (!sel.paths.every((p) => p[colKey] === first)) break
    depth++
  }
  return depth
}
