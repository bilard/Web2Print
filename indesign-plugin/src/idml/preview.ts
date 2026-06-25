// indesign-plugin/src/idml/preview.ts
// Aperçu DANS la page, NON destructif : on remplace le texte d'un élément balisé
// sans jamais le vider (sinon InDesign supprime la balise). Technique : insérer la
// nouvelle valeur au DÉBUT (dans le marquage) puis supprimer les anciens caractères
// → l'élément garde toujours au moins 1 caractère, la balise reste ancrée.
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

function currentText(el: any): string {
  try { return el.texts.item(0).contents ?? '' } catch { return '' }
}

/** Remplace le texte de l'élément balisé SANS supprimer la balise. */
function replaceTaggedText(el: any, value: string): void {
  try {
    const before = el.characters.length
    // insérer au tout début de l'élément (donc à l'intérieur du marquage)
    el.insertionPoints.item(0).contents = value
    const after = el.characters.length
    const insertedLen = after - before // nb réel de caractères ajoutés
    // les anciens caractères sont maintenant en fin : indices [insertedLen .. after-1]
    const chars = el.characters
    for (let i = after - 1; i >= insertedLen; i--) chars.item(i).remove()
  } catch { /* élément non textuel (image, etc.) : ignorer */ }
}

/** Applique les valeurs de la ligne dans la page (mémorise l'original au 1er passage). */
export function applyRowPreview(doc: any, valuesByTag: Record<string, string>): void {
  eachTaggedElement(doc, (el, tagName) => {
    const value = valuesByTag[tagName]
    if (value === undefined) return
    const id = String(el.id)
    if (!originalContent.has(id)) originalContent.set(id, currentText(el))
    replaceTaggedText(el, value)
  })
}

/** Restaure le texte d'origine mémorisé (balises conservées). */
export function restorePreview(doc: any): void {
  eachTaggedElement(doc, (el) => {
    const id = String(el.id)
    if (originalContent.has(id)) {
      replaceTaggedText(el, originalContent.get(id) ?? '')
      originalContent.delete(id)
    }
  })
}

/** Oublie la mémoire d'aperçu (ex. à la fermeture du document). */
export function resetPreviewMemory(): void {
  originalContent.clear()
}
