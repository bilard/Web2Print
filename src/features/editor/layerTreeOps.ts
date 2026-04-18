import { Group } from 'fabric'
import type { FabricObject } from 'fabric'

/** Cherche un objet par id récursivement (top-level + enfants de groupes) */
export function findById(objects: FabricObject[], id: string): FabricObject | undefined {
  for (const o of objects) {
    if ((o as unknown as { data?: { id?: string } }).data?.id === id) return o
    if (o instanceof Group) {
      const found = findById(o.getObjects(), id)
      if (found) return found
    }
  }
  return undefined
}

/** Cherche le groupe parent contenant l'objet avec cet id */
export function findParentGroup(objects: FabricObject[], id: string): Group | undefined {
  for (const o of objects) {
    if (o instanceof Group) {
      if (o.getObjects().some((c) => (c as unknown as { data?: { id?: string } }).data?.id === id)) return o
      const found = findParentGroup(o.getObjects(), id)
      if (found) return found
    }
  }
  return undefined
}

/** Vérifie si déplacer `child` dans `groupId` créerait un cycle (groupe dans l'un de ses descendants) */
export function wouldCreateCycle(child: FabricObject, groupId: string): boolean {
  if (!(child instanceof Group)) return false
  return findById(child.getObjects(), groupId) !== undefined
}
