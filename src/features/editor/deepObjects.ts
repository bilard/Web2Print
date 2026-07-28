import { Group, type FabricObject } from 'fabric'

/**
 * Aplatit récursivement la liste d'objets, contenu des Groups inclus : les
 * champs de fusion {{…}} peuvent vivre DANS un Group (blocs marketing créés
 * par l'import PDF → SVG) — `canvas.getObjects()` seul ne les verrait pas.
 */
export function collectObjectsDeep(objects: FabricObject[]): FabricObject[] {
  const out: FabricObject[] = []
  for (const obj of objects) {
    out.push(obj)
    if (obj instanceof Group) {
      out.push(...collectObjectsDeep((obj._objects ?? []) as FabricObject[]))
    }
  }
  return out
}

/**
 * Recherche un objet Fabric par `data.id` dans TOUT le canvas, enfants de
 * Groups inclus.
 *
 * `canvas.getObjects().find(…)` ne voit que le premier niveau : un objet
 * sélectionné à l'intérieur d'un bloc (import IDML/PPTX, ou SVG non aplati)
 * y est introuvable — les panneaux échouaient alors en silence (couleur non
 * appliquée, image du DAM non incorporée).
 */
export function findFabricObjectDeep(
  canvas: { getObjects: () => FabricObject[] } | null | undefined,
  id: string | null | undefined,
): FabricObject | undefined {
  if (!canvas || !id) return undefined
  return collectObjectsDeep(canvas.getObjects()).find(
    (o) => (o.data as { id?: string } | undefined)?.id === id,
  )
}

/** Recherche par id dans l'ARBRE du store éditeur (children des groupes inclus). */
export function findStoreObjectDeep<T extends { id: string; children?: T[] }>(
  objects: T[],
  id: string | null | undefined,
): T | undefined {
  if (!id) return undefined
  for (const o of objects) {
    if (o.id === id) return o
    const hit = o.children?.length ? findStoreObjectDeep(o.children, id) : undefined
    if (hit) return hit
  }
  return undefined
}

/** Aplatit l'arbre du store éditeur (groupes + enfants au même niveau). */
export function flattenStoreObjects<T extends { children?: T[] }>(objects: T[]): T[] {
  const out: T[] = []
  for (const o of objects) {
    out.push(o)
    if (o.children?.length) out.push(...flattenStoreObjects(o.children))
  }
  return out
}

/**
 * Invalide rendu + layout des Groups ancêtres après mutation d'un enfant :
 * Fabric ne recalcule ni le cache ni la bbox du groupe quand le texte d'un
 * enfant change (substitution de fusion) — sans ça le nouveau texte serait
 * rogné aux anciennes limites du bloc.
 */
export function refreshAncestorGroups(obj: FabricObject): void {
  let g = (obj as FabricObject & { group?: Group }).group
  while (g) {
    g.triggerLayout()
    g.set('dirty', true)
    g = (g as Group & { group?: Group }).group
  }
}
