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

/** Lit le texte représenté par l'élément balisé (sans toucher au marquage). */
function readText(el: any): string {
  try {
    const c = el.xmlContent
    if (c && typeof c.contents === 'string') return c.contents
  } catch { /* élément non textuel */ }
  return ''
}

/** Écrit le texte représenté par l'élément balisé. NON destructif : on édite le
 *  TEXTE (`el.xmlContent.contents`) et non `el.contents`, qui sous InDesign
 *  supprime l'élément XML (la balise) au lieu de juste changer le texte. */
function writeText(el: any, value: string): void {
  try {
    const c = el.xmlContent
    if (c && typeof c.contents === 'string') c.contents = value
  } catch { /* élément non textuel (image, etc.) : ignorer */ }
}

/** Remplace le contenu de chaque élément tagué par la valeur de la ligne. */
export function applyRowPreview(doc: any, valuesByTag: Record<string, string>): void {
  eachTaggedElement(doc, (el, tagName) => {
    const value = valuesByTag[tagName]
    if (value === undefined) return
    const id = String(el.id)
    if (!originalContent.has(id)) originalContent.set(id, readText(el))
    writeText(el, value)
  })
}

/** Restaure le contenu d'origine mémorisé. */
export function restorePreview(doc: any): void {
  eachTaggedElement(doc, (el) => {
    const id = String(el.id)
    if (originalContent.has(id)) {
      writeText(el, originalContent.get(id) ?? '')
      originalContent.delete(id)
    }
  })
}

/** Filet : re-pose {{tag}} comme contenu (utile si la mémoire de session est perdue). */
export function restoreAllPlaceholders(doc: any): void {
  eachTaggedElement(doc, (el, tagName) => { writeText(el, `{{${tagName}}}`) })
  originalContent.clear()
}

/** Oublie la mémoire d'aperçu (ex. à la fermeture du document). */
export function resetPreviewMemory(): void {
  originalContent.clear()
}
