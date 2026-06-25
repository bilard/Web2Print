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

/** Remplace le texte d'un élément balisé SANS supprimer la balise. Gère 2 cas :
 *  - élément qui tague un CADRE de texte → on écrit le contenu du cadre (la balise est
 *    sur le cadre, qui persiste) : sûr et simple.
 *  - élément qui tague une PLAGE de texte → on remplace le 1er caractère existant puis
 *    on supprime les anciens (l'élément n'est jamais vidé, l'ancrage de plage tient). */
function replaceTaggedText(el: any, value: string): void {
  // Cas cadre taggé : xmlContent est un TextFrame → .contents remplace le texte du cadre.
  try {
    const content = el.xmlContent
    const typeName = String(content?.constructor?.name || '')
    if (content && (typeName === 'TextFrame' || typeName === 'Story')) {
      content.contents = value
      return
    }
  } catch { /* pas un cadre : on tente la plage ci-dessous */ }

  // Cas plage de texte taggée : remplacer le 1er char, puis trim.
  try {
    const origLen = el.characters.length
    if (origLen === 0) { el.insertionPoints.item(0).contents = value; return }
    el.characters.item(0).contents = value
    const remaining = origLen - 1
    const chars = el.characters
    const total = chars.length
    for (let i = total - 1; i >= total - remaining; i--) chars.item(i).remove()
  } catch { /* élément non textuel (image, etc.) : ignorer */ }
}

/** Action explicite : remplit la page avec les valeurs de la ligne (balises conservées).
 *  Retourne un diagnostic (nb rempli + types d'éléments rencontrés). */
export function fillPageWithRow(doc: any, valuesByTag: Record<string, string>): { filled: number; types: string } {
  let filled = 0
  const types = new Set<string>()
  eachTaggedElement(doc, (el, tagName) => {
    const value = valuesByTag[tagName]
    if (value === undefined) return
    try { types.add(String(el.xmlContent?.constructor?.name || '?')) } catch { types.add('?') }
    replaceTaggedText(el, value)
    filled++
  })
  return { filled, types: Array.from(types).join(',') }
}

/** Action explicite : remet chaque élément balisé à `{{champ}}` (réversible, sans mémoire). */
export function restoreAllPlaceholders(doc: any): number {
  let n = 0
  eachTaggedElement(doc, (el, tagName) => { replaceTaggedText(el, `{{${tagName}}}`); n++ })
  return n
}
