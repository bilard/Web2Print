import type {
  ScrapingTemplate,
  FieldSelector,
  GroupSelector,
  SelectorStrategy,
  TemplateApplyResult,
} from './types'
import type { EnrichedDocument } from '@/features/excel/ai-enrichment/types'
import { buildDocument } from '@/features/excel/ai-enrichment/documentUtils'

/**
 * Engine d'application d'un template sur un document HTML rendu.
 * Pure function : aucun fetch, aucun state. Entrée = HTML + template,
 * sortie = valeurs extraites.
 *
 * Les pre-actions (click, scroll…) doivent être exécutées AVANT par
 * l'appelant (extension Chrome côté browser, ou Puppeteer côté serveur)
 * puis on passe le HTML résultant à cette fonction.
 */

function resolveStrategy(
  doc: Document | Element,
  strategy: SelectorStrategy,
): string[] {
  try {
    if (strategy.kind === 'css') {
      const nodes = doc.querySelectorAll(strategy.expression)
      return Array.from(nodes).map((n) => readValue(n, strategy))
    }
    if (strategy.kind === 'xpath') {
      // DOMParser document supports XPath via document.evaluate
      const ownerDoc = (doc as Element).ownerDocument ?? (doc as Document)
      if (!ownerDoc.evaluate) return []
      const result = ownerDoc.evaluate(
        strategy.expression,
        doc as Node,
        null,
        7, // ORDERED_NODE_SNAPSHOT_TYPE
        null,
      )
      const out: string[] = []
      for (let i = 0; i < result.snapshotLength; i++) {
        const node = result.snapshotItem(i)
        if (node) out.push(readValue(node as Element, strategy))
      }
      return out
    }
    if (strategy.kind === 'attr') {
      // expression = "selector@@attr"  (ex: "img[src]@@src")
      const [sel, attr] = strategy.expression.split('@@')
      const nodes = (doc as Element).querySelectorAll(sel)
      return Array.from(nodes)
        .map((n) => n.getAttribute(attr ?? 'href') ?? '')
        .filter(Boolean)
    }
    if (strategy.kind === 'text') {
      // expression = regex, on scanne tout le textContent du doc
      const text = 'textContent' in doc ? (doc.textContent ?? '') : ''
      const re = new RegExp(strategy.expression, 'g')
      const matches: string[] = []
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null) matches.push(m[1] ?? m[0])
      return matches
    }
    if (strategy.kind === 'text-with-hierarchy') {
      // expression = sélecteur CSS du conteneur. Sortie = Markdown structuré
      // (H1/H2/H3, listes, tables) — règle universelle scraping #3.
      const nodes = doc.querySelectorAll(strategy.expression)
      const out: string[] = []
      for (const n of Array.from(nodes)) {
        const md = extractMarkdownHierarchy(n)
        if (md) out.push(md)
      }
      return out
    }
  } catch {
    /* selector invalide → retourne [] */
  }
  return []
}

/**
 * Tags qui introduisent une cassure de ligne visuelle. On insère un \n à l'entrée
 * ET à la sortie pour que le texte extrait conserve la structure des paragraphes
 * (sans quoi `<h2>Titre</h2><p>Corps</p>` devient "TitreCorps" — textContent
 * ne sépare pas les enfants).
 */
const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BR', 'DD', 'DETAILS', 'DIALOG',
  'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HGROUP', 'HR', 'LI', 'MAIN',
  'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TR', 'UL',
])

/**
 * Walker DOM → Markdown qui préserve la hiérarchie sémantique :
 * H1/H2/H3 → #/##/### titres, paragraphes séparés par lignes vides,
 * listes UL/OL → "- item", tables → "| key | value |", `<br>` → saut de ligne.
 *
 * Utilisé par la stratégie `text-with-hierarchy` pour alimenter le LLM avec
 * une vue structurée d'un onglet/section au lieu d'un textContent plat.
 * Règle universelle scraping #3 : 100% du contenu de l'onglet, structure
 * Titre/texte/etc. respectée.
 */
export function extractMarkdownHierarchy(el: Element): string {
  const lines: string[] = []

  const cellText = (e: Element): string => (e.textContent ?? '').replace(/\s+/g, ' ').trim()

  const walk = (node: Node, listDepth: number, ordered: boolean): void => {
    if (node.nodeType === 3 /* TEXT */) {
      const t = (node.nodeValue ?? '').replace(/\s+/g, ' ').trim()
      if (t) lines.push(t)
      return
    }
    if (node.nodeType !== 1 /* ELEMENT */) return
    const e = node as Element
    const tag = e.tagName
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') return

    if (/^H[1-6]$/.test(tag)) {
      const level = Math.min(parseInt(tag.slice(1), 10), 6)
      const text = cellText(e)
      if (text) {
        lines.push('')
        lines.push('#'.repeat(level) + ' ' + text)
        lines.push('')
      }
      return
    }
    if (tag === 'BR') { lines.push(''); return }
    if (tag === 'HR') { lines.push(''); lines.push('---'); lines.push(''); return }
    if (tag === 'UL' || tag === 'OL') {
      const isOrdered = tag === 'OL'
      let itemIndex = 0
      for (const child of Array.from(e.childNodes)) {
        if (child.nodeType !== 1) continue
        const liEl = child as Element
        if (liEl.tagName !== 'LI') continue
        itemIndex += 1
        const text = cellText(liEl)
        if (!text) continue
        const indent = '  '.repeat(Math.max(listDepth, 0))
        const prefix = isOrdered ? `${itemIndex}.` : '-'
        lines.push(indent + prefix + ' ' + text)
      }
      lines.push('')
      return
    }
    if (tag === 'LI') {
      // Cas marginal : LI orphelin (hors UL/OL) — rendu en bullet plat
      const text = cellText(e)
      if (text) lines.push('- ' + text)
      return
    }
    if (tag === 'TABLE') {
      const rows = Array.from(e.querySelectorAll('tr'))
      let header = false
      for (const tr of rows) {
        const cells = Array.from(tr.querySelectorAll('th, td')).map(cellText).filter(Boolean)
        if (cells.length === 0) continue
        lines.push('| ' + cells.join(' | ') + ' |')
        if (!header && tr.querySelector('th')) {
          lines.push('| ' + cells.map(() => '---').join(' | ') + ' |')
          header = true
        }
      }
      lines.push('')
      return
    }
    if (tag === 'P' || tag === 'BLOCKQUOTE' || tag === 'PRE') {
      const text = cellText(e)
      if (text) {
        const prefix = tag === 'BLOCKQUOTE' ? '> ' : tag === 'PRE' ? '    ' : ''
        lines.push(prefix + text)
        lines.push('')
      }
      return
    }
    // Conteneur générique : descendre dans les enfants
    for (const child of Array.from(e.childNodes)) walk(child, listDepth, ordered)
  }

  walk(el, 0, false)

  return lines
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractRichText(el: Element): string {
  const parts: string[] = []
  const walk = (node: Node): void => {
    if (node.nodeType === 3 /* TEXT */) {
      const t = (node.nodeValue ?? '').replace(/\s+/g, ' ')
      if (t) parts.push(t)
      return
    }
    if (node.nodeType !== 1 /* ELEMENT */) return
    const elNode = node as Element
    const tag = elNode.tagName
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return
    if (tag === 'BR') { parts.push('\n'); return }
    const isBlock = BLOCK_TAGS.has(tag)
    if (isBlock) parts.push('\n')
    for (const child of Array.from(elNode.childNodes)) walk(child)
    if (isBlock) parts.push('\n')
  }
  walk(el)
  return parts.join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function readValue(node: Node, strategy: SelectorStrategy): string {
  const el = node as Element
  let raw: string
  if (strategy.attr) {
    raw = el.getAttribute(strategy.attr) ?? ''
  } else {
    raw = extractRichText(el)
  }
  if (strategy.regex) {
    try {
      const m = raw.match(new RegExp(strategy.regex))
      if (m) raw = m[1] ?? m[0]
    } catch { /* invalid regex */ }
  }
  return raw
}

function applyTransform(
  value: string,
  transform: FieldSelector['transform'] | undefined,
  baseUrl: string | undefined,
): string {
  if (!transform) return value
  switch (transform) {
    case 'trim': return value.trim()
    case 'lowercase': return value.toLowerCase()
    case 'uppercase': return value.toUpperCase()
    case 'normalize-whitespace': return value.replace(/\s+/g, ' ').trim()
    case 'parse-number': {
      const n = value.replace(/[^\d.,-]/g, '').replace(',', '.')
      return n
    }
    case 'parse-price': {
      const m = value.match(/(\d+[.,]?\d*)/)
      return m ? m[1].replace(',', '.') : ''
    }
    case 'absolutize-url': {
      if (!baseUrl || !value) return value
      try { return new URL(value, baseUrl).toString() } catch { return value }
    }
    case 'decode-html':
      return value
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
  }
}

/**
 * Si un champ multiple ne matche qu'un seul élément (le container parent),
 * on tente d'extraire les items-frères intrinsèques (li, > div, > p) pour
 * récupérer la liste réelle. Permet à un utilisateur d'écrire un simple
 * `div.content-advantages` au lieu de `div.content-advantages > li`.
 */
function expandContainerToItems(
  doc: Document,
  strategy: SelectorStrategy,
): string[] | null {
  if (strategy.kind !== 'css') return null
  let nodes: Element[]
  try { nodes = Array.from(doc.querySelectorAll(strategy.expression)) }
  catch { return null }
  if (nodes.length !== 1) return null
  const container = nodes[0]
  // Stratégie : chercher les enfants répétés les plus probables (li, p, div,
  // img, a). On prend la 1re liste non-triviale (≥ 2 items).
  const candidates: Array<string> = []
  const childSelectors = ['li', ':scope > p', ':scope > div', ':scope > a', ':scope > span', 'img']
  for (const sel of childSelectors) {
    try {
      const kids = Array.from(container.querySelectorAll(sel))
      if (kids.length < 2) continue
      // Pour les img/a : prendre l'attribut src/href ; sinon textContent
      const values = kids.map((k) => {
        if (k.tagName === 'IMG') return (k as HTMLImageElement).getAttribute('src') ?? ''
        if (k.tagName === 'A' && (k as HTMLAnchorElement).href) return (k as HTMLAnchorElement).getAttribute('href') ?? ''
        return (k.textContent ?? '').replace(/\s+/g, ' ').trim()
      }).filter((v) => v && v.length > 0)
      if (values.length >= 2) {
        return values
      }
    } catch { /* invalid selector */ }
    if (candidates.length > 0) break
  }
  return null
}

/**
 * Si aucune structure enfant n'est détectée, tenter un split textuel :
 * bullets (•, ▪), tirets/em-dash répétés, ou lignes.
 */
function splitTextIntoItems(text: string): string[] | null {
  const trimmed = text.trim()
  if (trimmed.length < 40) return null
  // Priorité 1 : bullets Unicode
  const bulletSplit = trimmed.split(/\s*[•▪►▶]\s+|\s*[-–—]\s{2,}/).map((s) => s.trim()).filter(Boolean)
  if (bulletSplit.length >= 3) return bulletSplit
  // Priorité 2 : séparation par lignes non-vides
  const lineSplit = trimmed.split(/\n+/).map((s) => s.trim()).filter((s) => s.length >= 8)
  if (lineSplit.length >= 3) return lineSplit
  // Priorité 3 : séparation par "Les + …" pattern marketing FR ou similaire
  const marketingSplit = trimmed.split(/(?=\b(?:Les\s*\+|Advantages?|Points?\s*forts?|Features?)\b)/i).map((s) => s.trim()).filter(Boolean)
  if (marketingSplit.length >= 2) return marketingSplit
  return null
}

function applyField(
  doc: Document,
  field: FieldSelector,
  baseUrl: string | undefined,
): { value: unknown; warning: string | null } {
  for (const strategy of field.strategies) {
    const raw = resolveStrategy(doc, strategy)
    let cleaned = raw
      .map((v) => applyTransform(v, field.transform, baseUrl))
      .filter((v) => v && v.length > 0)
    // Champs liste qui ne matchent qu'un seul élément : tenter d'exploser
    // le conteneur en sous-items (LI, paragraphes) ou de splitter le texte.
    if (field.multiple && cleaned.length === 1 && strategy.kind === 'css') {
      const expanded = expandContainerToItems(doc, strategy)
      if (expanded && expanded.length >= 2) {
        cleaned = expanded
          .map((v) => applyTransform(v, field.transform, baseUrl))
          .filter((v) => v && v.length > 0)
      } else {
        const textSplit = splitTextIntoItems(cleaned[0])
        if (textSplit && textSplit.length >= 2) cleaned = textSplit
      }
    }
    if (cleaned.length > 0) {
      return field.multiple
        ? { value: Array.from(new Set(cleaned)), warning: null }
        : { value: cleaned[0], warning: null }
    }
  }
  return { value: field.multiple ? [] : null, warning: `no match for "${field.field}"` }
}

function applyGroup(
  doc: Document,
  group: GroupSelector,
  baseUrl: string | undefined,
): { group: string; pairs: Array<{ name: string; value: string }> } | null {
  const containers = resolveStrategy(doc, group.container)
  // resolveStrategy retourne strings, mais on a besoin des noeuds : refaire une requête
  const containerNodes = group.container.kind === 'css'
    ? Array.from(doc.querySelectorAll(group.container.expression))
    : []
  if (containerNodes.length === 0 || containers.length === 0) return null
  const out: { group: string; pairs: Array<{ name: string; value: string }> }[] = []
  for (const container of containerNodes) {
    const titleVals = resolveStrategy(container, group.titleSelector)
    const title = (titleVals[0] ?? 'Spécifications').trim()
    const rowsNodes = group.rowSelector.kind === 'css'
      ? Array.from(container.querySelectorAll(group.rowSelector.expression))
      : []
    const pairs: Array<{ name: string; value: string }> = []
    for (const row of rowsNodes) {
      const keys = resolveStrategy(row, group.keySelector)
      const values = resolveStrategy(row, group.valueSelector)
      const key = (keys[0] ?? '').trim()
      const value = (values[0] ?? '').trim()
      if (key && value && key !== value) pairs.push({ name: key, value })
    }
    if (pairs.length > 0) out.push({ group: title, pairs })
  }
  // Retourne le premier groupe non-vide (typiquement un seul par template)
  return out[0] ?? null
}

/**
 * Applique un template sur un document HTML. Pure, testable, sans fetch.
 */
export function applyTemplate(
  template: ScrapingTemplate,
  html: string,
  baseUrl?: string,
): TemplateApplyResult {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const fields: Record<string, unknown> = {}
  const warnings: string[] = []

  for (const field of template.fields) {
    const { value, warning } = applyField(doc, field, baseUrl)
    fields[field.field] = value
    if (warning) warnings.push(warning)
  }

  const specGroups: TemplateApplyResult['specGroups'] = []
  for (const group of template.specGroups) {
    const result = applyGroup(doc, group, baseUrl)
    if (result) specGroups.push(result)
    else warnings.push(`no match for specs group (selector ${group.container.expression})`)
  }

  return {
    templateId: template.id,
    vendorDomain: template.vendorDomain,
    fields,
    specGroups,
    warnings,
    extractedAt: Date.now(),
  }
}

/**
 * Vérifie si un template matche une URL donnée (domaine + urlPattern).
 */
export function templateMatchesUrl(template: ScrapingTemplate, url: string): boolean {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')
    const vendor = template.vendorDomain.replace(/^www\./, '')
    if (!host.endsWith(vendor) && host !== vendor) return false
    if (!template.urlPattern || template.urlPattern === '.*') return true
    return new RegExp(template.urlPattern).test(parsed.pathname + parsed.search)
  } catch {
    return false
  }
}

/**
 * Regex des sections "avantages" (mêmes keywords que la parseuse markdown).
 * Si un heading les matche, on considère qu'un groupe peut en être extrait.
 */
const FEATURE_HEADING_RE = /(?:avantages?|features?|points?\s*forts?|b[eé]n[eé]fices?|les\s*\+|atouts?|plus\s+produit|caract[eé]ristiques?)/i

/** Extrait le libellé de groupe en retirant le préfixe marketing ("Les + "). */
function extractGroupLabel(raw: string): string | undefined {
  const cleaned = raw
    .replace(/\s+/g, ' ')
    .replace(/\*\*/g, '')
    .replace(/^les\s*\+\s*/i, '')
    .replace(/^(avantages?|features?|points?\s*forts?|b[eé]n[eé]fices?|atouts?|plus\s+produit|caract[eé]ristiques?)\s*[:\-–—]?\s*/i, '')
    .trim()
  return cleaned.length >= 2 && cleaned.length < 80 ? cleaned : undefined
}

/**
 * Pour un élément matché, remonte les ancêtres et scanne les siblings
 * précédents à la recherche du heading (H1–H6) qui introduit la section.
 * On ne retient que les headings qui matchent FEATURE_HEADING_RE, et on
 * strip le préfixe marketing ("Les + Nicoll performance" → "Nicoll performance").
 */
function findPrecedingFeatureHeading(el: Element): string | undefined {
  let cur: Element | null = el
  while (cur && cur.parentElement) {
    let sib: Element | null = cur.previousElementSibling
    while (sib) {
      const candidates: Element[] = []
      if (/^H[1-6]$/.test(sib.tagName)) candidates.push(sib)
      const nested = sib.querySelectorAll('h1, h2, h3, h4, h5, h6')
      if (nested.length > 0) candidates.push(nested[nested.length - 1])
      for (const h of candidates) {
        const text = (h.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (!text || !FEATURE_HEADING_RE.test(text)) continue
        const group = extractGroupLabel(text)
        if (group) return group
      }
      sib = sib.previousElementSibling
    }
    cur = cur.parentElement
    if (cur?.tagName === 'BODY') break
  }
  return undefined
}

/**
 * Variante spécialisée pour le champ `advantages` : extrait chaque item AVEC
 * son groupe issu du heading H1–H6 qui le précède dans le DOM. Respecte
 * l'expansion automatique d'un container unique en enfants (li/p/div) — comme
 * applyField — pour supporter les selectors génériques type `ul.advantages`.
 *
 * Retourne [] si aucun node ne matche — l'appelant fera un fallback sur la
 * liste plate du champ.
 */
export function applyAdvantagesWithGroups(
  html: string,
  field: FieldSelector,
  baseUrl?: string,
): Array<{ text: string; group?: string }> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  for (const strategy of field.strategies) {
    if (strategy.kind !== 'css') continue
    let nodes: Element[]
    try { nodes = Array.from(doc.querySelectorAll(strategy.expression)) } catch { continue }
    if (nodes.length === 0) continue
    // Si un seul match et champ multiple : expand le container en items-frères
    if (nodes.length === 1 && field.multiple) {
      const container = nodes[0]
      const childSels = ['li', ':scope > p', ':scope > div', ':scope > a', ':scope > span']
      for (const sel of childSels) {
        try {
          const kids = Array.from(container.querySelectorAll(sel))
          if (kids.length >= 2) { nodes = kids; break }
        } catch { /* skip */ }
      }
    }
    const out: Array<{ text: string; group?: string }> = []
    const seen = new Set<string>()
    for (const node of nodes) {
      const raw = readValue(node, strategy)
      const text = applyTransform(raw, field.transform, baseUrl).replace(/\s+/g, ' ').trim()
      if (!text || seen.has(text)) continue
      seen.add(text)
      const group = findPrecedingFeatureHeading(node)
      out.push(group ? { text, group } : { text })
    }
    if (out.length > 0) return out
  }
  return []
}

/**
 * Extrait des variantes depuis un `<table>` du container capturé.
 * Reproduit la logique de `parseVariantsFromMarkdown` directement sur le DOM :
 * détecte la colonne Réf. (r[eé]f / code / sku / article / model), la colonne
 * Libellé (libell[eé] / d[eé]signation / description / nom / produit / name),
 * et les autres colonnes deviennent des propriétés.
 *
 * Retourne [] si le container ne contient pas de table reconnaissable —
 * l'appelant fallback sur la logique string-split classique.
 */
export function applyVariantsFromHtml(
  html: string,
  field: FieldSelector,
  _baseUrl?: string,
): Array<{ reference: string; label: string; properties: Record<string, string> }> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  for (const strategy of field.strategies) {
    if (strategy.kind !== 'css') continue
    let containers: Element[]
    try { containers = Array.from(doc.querySelectorAll(strategy.expression)) } catch { continue }
    if (containers.length === 0) continue
    const variants: Array<{ reference: string; label: string; properties: Record<string, string> }> = []
    for (const container of containers) {
      const tables = container.tagName === 'TABLE'
        ? [container]
        : Array.from(container.querySelectorAll('table'))
      for (const table of tables) variants.push(...extractVariantsFromTable(table))
    }
    if (variants.length > 0) return dedupeByRef(variants)
  }
  return []
}

const REF_HEADER_RE = /^r[eé]f|^code|^sku|^article|^part\s*n|^model/i
const LABEL_HEADER_RE = /^(libell[eé]|d[eé]signation|description|nom|produit|name|product)/i
const JUNK_CELL_RE = /^[-–—:\s]*$/
const ACCORDION_NOISE_RE = /caract[eé]ristiques|voir\s+moins|voir\s+plus|\+\s*×|description\s+d[eé]taill/i

/** Parse un blob "K1 : V1 K2 : V2 …" (rendu Jina-like) en paires nom/valeur.
 *  Utilise le même lookahead que parseCharacteristicsBlob dans useProductEnrichment. */
function parseCharacteristicsInline(blob: string): Record<string, string> {
  const out: Record<string, string> = {}
  const cleaned = blob
    .replace(/caract[eé]ristiques/gi, ' ')
    .replace(/voir\s+(moins|plus)/gi, ' ')
    .replace(/\+\s*×/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const pat = /([A-ZÉÈÊÀÂÎÔÛÇ][A-Za-zÀ-ÿ'’\- ]*?)\s*:\s*(.+?)(?=\s+[A-ZÉÈÊÀÂÎÔÛÇ][A-Za-zÀ-ÿ'’\- ]*?\s*:\s|\s*$)/g
  let m: RegExpExecArray | null
  while ((m = pat.exec(cleaned)) !== null) {
    const key = m[1].trim()
    const value = m[2].trim()
    if (!key || !value) continue
    if (key.length < 2 || key.length > 60) continue
    if (/tarif|prix|price/i.test(key)) continue
    out[key] = value
  }
  return out
}

function extractVariantsFromTable(
  table: Element,
): Array<{ reference: string; label: string; properties: Record<string, string> }> {
  const cellText = (c: Element) => (c.textContent ?? '').replace(/\s+/g, ' ').trim()
  let headers: string[] = []
  const thead = table.querySelector('thead')
  if (thead) {
    headers = Array.from(thead.querySelectorAll('th, td')).map(cellText)
  }
  if (headers.length === 0) {
    const firstTr = table.querySelector('tr')
    if (firstTr) {
      const thCells = firstTr.querySelectorAll('th')
      if (thCells.length > 0) headers = Array.from(thCells).map(cellText)
    }
  }
  const refIdx = headers.findIndex((h) => REF_HEADER_RE.test(h))
  if (refIdx < 0) return []
  const labelIdx = headers.findIndex((h) => LABEL_HEADER_RE.test(h))
  const minCells = Math.max(2, Math.floor(headers.length * 0.6))
  const tbody = table.querySelector('tbody') ?? table
  const rows = Array.from(tbody.querySelectorAll('tr'))
  const out: Array<{ reference: string; label: string; properties: Record<string, string> }> = []
  let lastVariant: (typeof out)[number] | null = null
  for (const row of rows) {
    const tds = Array.from(row.querySelectorAll('td'))
    if (tds.length === 0) continue
    const cells = tds.map(cellText)
    const rowText = cells.join(' ')

    // Ligne accordéon / détail : colspan condensé en 1-2 cellules, contenu
    // "Caractéristiques … Voir moins" ou similaire. On merge les paires K:V
    // dans la variante précédente au lieu de créer une fausse variante.
    const isAccordion =
      cells.length < minCells
      && lastVariant !== null
      && (ACCORDION_NOISE_RE.test(rowText) || /\s:\s/.test(rowText))
    if (isAccordion) {
      const parsed = parseCharacteristicsInline(rowText)
      for (const [k, v] of Object.entries(parsed)) {
        if (!lastVariant!.properties[k]) lastVariant!.properties[k] = v
      }
      continue
    }

    // Sinon, ligne de variante : elle doit avoir ~autant de cellules que le header
    // et un ref valide.
    if (cells.length < minCells) continue
    if (cells.length <= refIdx) continue
    const ref = cells[refIdx]
    if (!ref || JUNK_CELL_RE.test(ref) || ACCORDION_NOISE_RE.test(ref)) continue
    // Filtre défensif : la ref doit ressembler à une ref produit (pattern alphanum court).
    // Permissif : on accepte aussi d'autres formats mais jamais > 40 car (exclut les blobs).
    if (ref.length > 40) continue

    const label = labelIdx >= 0 && labelIdx < cells.length ? cells[labelIdx] : ''
    const properties: Record<string, string> = {}
    headers.forEach((h, idx) => {
      if (idx === refIdx || idx === labelIdx || idx >= cells.length) return
      const val = cells[idx]
      if (val && !JUNK_CELL_RE.test(val)) properties[h] = val
    })
    const variant = { reference: ref, label, properties }
    out.push(variant)
    lastVariant = variant
  }

  // Phase 2 : scanner les blocs "Caractéristiques … Voir moins" *hors* table
  // (certains thèmes mettent l'accordéon dans un <div> frère du <tr>).
  // On les associe à la variante correspondante par index d'apparition.
  if (out.length > 0) {
    const rootText = (table.parentElement ?? table).textContent ?? ''
    const blobRe = /Caract[eé]ristiques\s+([\s\S]+?)\s+Voir\s+moins/gi
    const blobs: string[] = []
    let bm: RegExpExecArray | null
    while ((bm = blobRe.exec(rootText)) !== null) {
      const content = bm[1].replace(/\s+/g, ' ').trim()
      if (content.length > 20 && content.includes(' : ')) blobs.push(content)
    }
    for (let i = 0; i < Math.min(blobs.length, out.length); i++) {
      const parsed = parseCharacteristicsInline(blobs[i])
      for (const [k, v] of Object.entries(parsed)) {
        if (!out[i].properties[k]) out[i].properties[k] = v
      }
    }
  }

  // Retirer les refs qui commencent par "Réf." (doublon avec le header de colonne)
  for (const v of out) {
    v.reference = v.reference.replace(/^r[eé]f\.?\s*/i, '').trim()
  }
  return out
}

function dedupeByRef<T extends { reference: string }>(arr: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const v of arr) {
    const k = v.reference.trim().toUpperCase()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(v)
  }
  return out
}

/**
 * Extraction spécialisée pour le champ `documents` : au lieu de prendre le
 * textContent des enfants (qui donne "Fiche technique" au lieu de l'URL),
 * on scanne tous les `<a href>` du container et on retourne les liens
 * au format `titre##url` (supporté par EnrichmentPanel).
 *
 * Heuristique : on priorise les liens PDF, puis tous les autres liens du
 * container si le prompt contient "tous" ou pas de filtre PDF.
 */
export function applyDocumentsFromHtml(
  html: string,
  field: FieldSelector,
  baseUrl?: string,
): EnrichedDocument[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  for (const strategy of field.strategies) {
    if (strategy.kind !== 'css') continue
    let containers: Element[]
    try { containers = Array.from(doc.querySelectorAll(strategy.expression)) } catch { continue }
    if (containers.length === 0) continue
    const results: EnrichedDocument[] = []
    const seen = new Set<string>()
    for (const container of containers) {
      const anchors = Array.from(container.querySelectorAll('a[href]')) as HTMLAnchorElement[]
      for (const a of anchors) {
        let href = a.getAttribute('href') ?? ''
        if (!href || href === '#' || href.startsWith('javascript:')) continue
        if (baseUrl) {
          try { href = new URL(href, baseUrl).toString() } catch { /* keep as-is */ }
        }
        if (!/^https?:\/\//.test(href)) continue
        if (seen.has(href)) continue
        seen.add(href)
        const title = (a.textContent ?? '').replace(/\s+/g, ' ').trim()
        results.push(buildDocument(href, title.length > 2 ? title : undefined))
      }
    }
    if (results.length > 0) return results
  }
  return []
}

/**
 * Score de qualité d'un résultat d'application : permet au flux
 * d'enrichissement de décider s'il fait confiance au template ou bascule
 * sur le fallback LLM.
 */
export function scoreApplyResult(result: TemplateApplyResult): number {
  let score = 0
  const f = result.fields
  if (typeof f.title === 'string' && f.title.length >= 3) score += 10
  if (typeof f.description === 'string' && f.description.length >= 40) score += 8
  if (Array.isArray(f.images) && f.images.length >= 1) score += 5
  if (Array.isArray(f.images) && f.images.length >= 3) score += 3
  if (Array.isArray(f.documents) && f.documents.length >= 1) score += 3
  const specCount = result.specGroups.reduce((n, g) => n + g.pairs.length, 0)
  score += Math.min(specCount, 20)
  return score
}
