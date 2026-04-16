/**
 * Génère un sélecteur CSS robuste pour un élément donné.
 * Stratégie : tester plusieurs options et retourner la plus courte qui
 * ne matche que cet élément (ou son voisinage immédiat si ciblage d'une liste).
 */
export function generateRobustSelector(el: Element, rootDoc: Document): string[] {
  const candidates: string[] = []

  // 1. ID explicite (meilleure ancre)
  if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) {
    candidates.push(`#${CSS.escape(el.id)}`)
  }

  // 2. Classes uniques (une seule, commune mais suffisante)
  const classes = Array.from(el.classList).filter((c) => !/^(is-|has-|active|hover|focus|selected|open|closed)/.test(c))
  if (classes.length > 0) {
    // Tenter une classe seule
    for (const c of classes) {
      const sel = `${el.tagName.toLowerCase()}.${CSS.escape(c)}`
      if (rootDoc.querySelectorAll(sel).length === 1) {
        candidates.push(sel)
        break
      }
    }
    // Puis combinaison de 2 classes
    if (candidates.length === 0 && classes.length >= 2) {
      const sel = `${el.tagName.toLowerCase()}.${CSS.escape(classes[0])}.${CSS.escape(classes[1])}`
      if (rootDoc.querySelectorAll(sel).length <= 3) candidates.push(sel)
    }
  }

  // 3. Attribut data-* ou aria-*
  for (const attrName of ['data-testid', 'data-test', 'data-id', 'data-field', 'itemprop', 'aria-label', 'name']) {
    const attrVal = el.getAttribute(attrName)
    if (attrVal && /^[\w\s-]+$/.test(attrVal) && attrVal.length < 50) {
      candidates.push(`[${attrName}="${attrVal.replace(/"/g, '\\"')}"]`)
    }
  }

  // 4. Chemin ancestral compact (max 3 niveaux)
  if (candidates.length === 0) {
    candidates.push(buildAncestorPath(el, 4))
  }

  // 5. Toujours une version nth-child exacte comme dernier recours
  candidates.push(buildNthChildPath(el))

  return candidates.filter(Boolean)
}

function buildAncestorPath(el: Element, maxDepth: number): string {
  const parts: string[] = []
  let cur: Element | null = el
  let depth = 0
  while (cur && cur !== cur.ownerDocument?.body && depth < maxDepth) {
    const tag = cur.tagName.toLowerCase()
    const cls = Array.from(cur.classList)
      .filter((c) => !/^(is-|has-|active|hover|focus|selected|open|closed|ng-|js-)/.test(c))
      .slice(0, 2)
    parts.unshift(cls.length > 0 ? `${tag}.${cls.map(CSS.escape).join('.')}` : tag)
    cur = cur.parentElement
    depth++
  }
  return parts.join(' > ')
}

function buildNthChildPath(el: Element): string {
  const parts: string[] = []
  let cur: Element | null = el
  while (cur && cur !== cur.ownerDocument?.body && cur.parentElement) {
    const parent: Element = cur.parentElement
    const siblings = Array.from(parent.children)
    const idx = siblings.indexOf(cur) + 1
    const tag = cur.tagName.toLowerCase()
    parts.unshift(`${tag}:nth-child(${idx})`)
    cur = parent
  }
  return parts.join(' > ')
}

/** Trouve le label lisible d'un élément (pour la suggestion de nom de champ). */
export function suggestFieldName(el: Element): string {
  const text = (el.textContent ?? '').trim().slice(0, 40)
  const tag = el.tagName.toLowerCase()
  if (tag === 'h1') return 'title'
  if (tag === 'img') return 'image'
  if (tag === 'a' && (el as HTMLAnchorElement).href.endsWith('.pdf')) return 'document'
  if (/^h[2-4]$/.test(tag)) return `heading-${text.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20)}`
  if (tag === 'p' && text.length > 100) return 'description'
  return 'field'
}
