/** Nom de champ depuis un attribut MarkupTag InDesign : "XMLTag/Prix" → "Prix". */
export function xmlTagName(markupTag: string | null): string | null {
  if (!markupTag) return null
  const name = markupTag.replace(/^XMLTag\//, '').trim()
  return name || null
}

/** Profondeur d'un élément (nombre d'ancêtres) — sert au tri du plus profond au moins profond. */
export function elementDepth(el: Element): number {
  let depth = 0
  let node: Node | null = el.parentNode
  while (node) {
    depth++
    node = node.parentNode
  }
  return depth
}
