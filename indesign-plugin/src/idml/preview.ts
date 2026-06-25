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
  // Méthode qui mettait bien les données dans la page : insérer la valeur au début de
  // l'élément (dans le marquage) puis supprimer les anciens caractères. L'élément n'est
  // jamais vidé → la balise garde son ancrage.
  try {
    const before = el.characters.length
    el.insertionPoints.item(0).contents = value
    const after = el.characters.length
    const insertedLen = after - before
    if (insertedLen <= 0) {
      // L'insertion n'a rien ajouté dans l'élément → écrire directement le contenu.
      el.texts.item(0).contents = value
      return
    }
    const chars = el.characters
    for (let i = after - 1; i >= insertedLen; i--) chars.item(i).remove()
  } catch (e) { console.log('[W2P] fill err', String(e)) }
}

/** Action explicite : remplit la page avec les valeurs de la ligne (balises conservées).
 *  Retourne un diagnostic (nb rempli + types d'éléments rencontrés). */
export function fillPageWithRow(doc: any, valuesByTag: Record<string, string>): { filled: number; types: string } {
  let filled = 0
  const types = new Set<string>()
  console.log('[W2P] fillPageWithRow — tags valeurs:', JSON.stringify(Object.keys(valuesByTag)))
  eachTaggedElement(doc, (el, tagName) => {
    const value = valuesByTag[tagName]
    if (value === undefined) { console.log('[W2P] tag sans valeur (slug ≠ colonne):', tagName); return }
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
