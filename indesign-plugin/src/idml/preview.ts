// indesign-plugin/src/idml/preview.ts
// Écriture DANS la page, NON destructive pour la balise : on remplace le texte d'un
// élément balisé sans jamais le vider (sinon InDesign supprime la balise). Technique :
// insérer la nouvelle valeur au DÉBUT (dans le marquage) puis supprimer les anciens
// caractères → l'élément garde toujours ≥1 caractère, la balise reste ancrée.
//
// La restauration n'utilise PAS de mémoire (fragile) : elle réécrit `{{champ}}` à
// partir du NOM de balise — toujours fiable, et c'est l'état attendu par la fusion
// Web2Print à l'export IDML.

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

/** Remplace le texte de l'élément balisé SANS supprimer la balise. */
function replaceTaggedText(el: any, value: string): void {
  try {
    const before = el.characters.length
    el.insertionPoints.item(0).contents = value // insérer au début (dans le marquage)
    const after = el.characters.length
    const insertedLen = after - before
    const chars = el.characters
    for (let i = after - 1; i >= insertedLen; i--) chars.item(i).remove() // supprimer l'ancien
  } catch { /* élément non textuel (image, etc.) : ignorer */ }
}

/** Action explicite : remplit la page avec les valeurs de la ligne (balises conservées). */
export function fillPageWithRow(doc: any, valuesByTag: Record<string, string>): void {
  eachTaggedElement(doc, (el, tagName) => {
    const value = valuesByTag[tagName]
    if (value === undefined) return
    replaceTaggedText(el, value)
  })
}

/** Action explicite : remet chaque élément balisé à `{{champ}}` (réversible, sans mémoire). */
export function restoreAllPlaceholders(doc: any): void {
  eachTaggedElement(doc, (el, tagName) => replaceTaggedText(el, `{{${tagName}}}`))
}
