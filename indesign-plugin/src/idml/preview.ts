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
  // --- DIAGNOSTIC : inspecter l'élément et ses accès texte ---
  const dbg: Record<string, unknown> = {}
  try { dbg.tag = el.markupTag?.name } catch { dbg.tag = 'err' }
  try { dbg.elType = String(el?.constructor?.name) } catch { dbg.elType = 'err' }
  let content: any
  try { content = el.xmlContent; dbg.contentType = String(content?.constructor?.name) } catch (e) { dbg.contentType = 'err ' + String(e) }
  try { dbg.contentHasContents = content ? (typeof content.contents) : 'no-content' } catch (e) { dbg.contentHasContents = 'err ' + String(e) }
  try { dbg.elCharsLen = el.characters?.length } catch (e) { dbg.elCharsLen = 'err ' + String(e) }
  try { dbg.contentTextsLen = content?.texts?.length } catch (e) { dbg.contentTextsLen = 'err ' + String(e) }
  console.log('[W2P] replaceTaggedText', JSON.stringify(dbg))

  // Tentative 1 : écrire le contenu de l'objet pointé (cadre/story).
  try {
    if (content && typeof content.contents !== 'undefined') {
      content.contents = value
      console.log('[W2P]  → écrit via content.contents OK')
      return
    }
  } catch (e) { console.log('[W2P]  ✗ content.contents:', String(e)) }

  // Tentative 2 : écrire le texte de la story du contenu.
  try {
    if (content?.texts?.length) {
      content.texts.item(0).contents = value
      console.log('[W2P]  → écrit via content.texts[0].contents OK')
      return
    }
  } catch (e) { console.log('[W2P]  ✗ content.texts[0]:', String(e)) }

  // Tentative 3 : manipulation caractères de l'élément (plage taguée).
  try {
    const origLen = el.characters.length
    if (origLen === 0) { el.insertionPoints.item(0).contents = value; console.log('[W2P]  → insert (vide) OK'); return }
    el.characters.item(0).contents = value
    const remaining = origLen - 1
    const chars = el.characters
    const total = chars.length
    for (let i = total - 1; i >= total - remaining; i--) chars.item(i).remove()
    console.log('[W2P]  → écrit via characters OK')
    return
  } catch (e) { console.log('[W2P]  ✗ characters:', String(e)) }

  console.log('[W2P]  ⚠️ AUCUNE méthode n’a fonctionné pour ce champ')
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
