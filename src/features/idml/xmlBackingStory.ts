import { xmlTagName } from './xmlElementTags'

/** Nœud de l'arbre des balises XML (hiérarchie conteneurs → feuilles). */
export interface TagTreeNode {
  field: string
  objectId?: string // XMLContent : Self de l'objet cible (story ou image), si présent
  children: TagTreeNode[]
}

function parseBacking(xml: string): Document | null {
  if (!xml || !xml.includes('XMLElement')) return null
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) return null
  return doc
}

/** Map XMLContent (Self d'objet) → nom de champ, pour relier les cadres/images à un champ. */
export function parseBackingStoryImageFields(backingStoryXml: string): Map<string, string> {
  const map = new Map<string, string>()
  const doc = parseBacking(backingStoryXml)
  if (!doc) return map
  for (const el of Array.from(doc.getElementsByTagName('XMLElement'))) {
    const objId = el.getAttribute('XMLContent')
    const field = xmlTagName(el.getAttribute('MarkupTag'))
    if (objId && field) map.set(objId, field)
  }
  return map
}

function buildNode(el: Element): TagTreeNode {
  const children: TagTreeNode[] = []
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i]
    if (child.nodeType === 1 && (child as Element).tagName === 'XMLElement') {
      children.push(buildNode(child as Element))
    }
  }
  return {
    field: xmlTagName(el.getAttribute('MarkupTag')) ?? '',
    objectId: el.getAttribute('XMLContent') ?? undefined,
    children,
  }
}

/** Arbre des balises depuis la racine (premier <XMLElement>, en ordre document). */
export function parseBackingStoryTagTree(backingStoryXml: string): TagTreeNode | null {
  const doc = parseBacking(backingStoryXml)
  if (!doc) return null
  const all = doc.getElementsByTagName('XMLElement')
  if (all.length === 0) return null
  return buildNode(all[0])
}
