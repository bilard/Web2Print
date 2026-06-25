// indesign-plugin/src/idml/preview.ts
// Mémoire de session : contenu d'origine par élément XML (pour restaurer l'aperçu).
const originalContent = new Map<string, string>()

function eachTaggedElement(doc: any, fn: (el: any, tagName: string) => void) {
  const walk = (el: any) => {
    const n = el.xmlElements?.length ?? 0
    for (let i = 0; i < n; i++) {
      const child = el.xmlElements.item(i)
      const tagName = child.markupTag?.name
      if (tagName) fn(child, tagName)
      walk(child)
    }
  }
  const root = doc.xmlElements?.item(0)
  if (root) walk(root)
}

/** Remplace le contenu de chaque élément tagué par la valeur de la ligne. */
export function applyRowPreview(doc: any, valuesByTag: Record<string, string>): void {
  eachTaggedElement(doc, (el, tagName) => {
    const value = valuesByTag[tagName]
    if (value === undefined) return
    const id = String(el.id)
    if (!originalContent.has(id)) originalContent.set(id, el.contents ?? '')
    el.contents = value
  })
}

/** Restaure le contenu d'origine mémorisé. */
export function restorePreview(doc: any): void {
  eachTaggedElement(doc, (el) => {
    const id = String(el.id)
    if (originalContent.has(id)) {
      el.contents = originalContent.get(id)
      originalContent.delete(id)
    }
  })
}

/** Filet : re-pose {{tag}} comme contenu (utile si la mémoire de session est perdue). */
export function restoreAllPlaceholders(doc: any): void {
  eachTaggedElement(doc, (el, tagName) => { el.contents = `{{${tagName}}}` })
  originalContent.clear()
}
