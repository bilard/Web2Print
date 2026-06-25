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

/** Remplace le texte de l'élément balisé SANS supprimer la balise.
 *  Technique sûre : on remplace le 1er caractère EXISTANT (donc à l'intérieur du
 *  marquage) par toute la valeur, puis on supprime les anciens caractères restants.
 *  L'élément n'est jamais vidé → la balise garde son ancrage. (Pas d'insertion à un
 *  bord ambigu, qui pouvait écrire hors balise.) */
function replaceTaggedText(el: any, value: string): void {
  try {
    const origLen = el.characters.length
    if (origLen === 0) {
      el.insertionPoints.item(0).contents = value // élément vide : insérer dedans
      return
    }
    el.characters.item(0).contents = value // remplace le 1er char (dans la balise) par la valeur
    const remaining = origLen - 1 // anciens caractères restants, désormais à la fin
    const chars = el.characters
    const total = chars.length
    for (let i = total - 1; i >= total - remaining; i--) chars.item(i).remove()
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
