// Accès bas niveau au XML d'un paquet IDML, partagé par le parser et
// l'exporteur.
//
// ⚠ `directChildren` filtre sur les enfants DIRECTS : un IDML imbrique les
// mêmes noms de balise à plusieurs niveaux (un TextFrame dans un Group dans un
// Spread), et un `getElementsByTagName` récursif ramènerait les descendants
// d'autres objets.
export function parseXml(xmlStr: string): Document {
  return new DOMParser().parseFromString(xmlStr, 'application/xml')
}

export function attr(el: Element, name: string, fallback = ''): string {
  return el.getAttribute(name) ?? fallback
}

/** Get direct child elements by tag name (`:scope >` doesn't work on XML docs from DOMParser) */
export function directChildren(parent: Element, tagName: string): Element[] {
  const result: Element[] = []
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i]
    if (child.nodeType === 1 && (child as Element).tagName === tagName) {
      result.push(child as Element)
    }
  }
  return result
}

/** Get text content from a <Properties><TagName> child element */
export function propText(el: Element, tagName: string): string | null {
  const propsArr = directChildren(el, 'Properties')
  if (propsArr.length === 0) return null
  const children = directChildren(propsArr[0], tagName)
  return children.length > 0 ? (children[0].textContent?.trim() || null) : null
}
