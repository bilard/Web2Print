import type {
  ScrapingTemplate,
  FieldSelector,
  GroupSelector,
  SelectorStrategy,
  TemplateApplyResult,
} from './types'

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
  } catch {
    /* selector invalide → retourne [] */
  }
  return []
}

function readValue(node: Node, strategy: SelectorStrategy): string {
  const el = node as Element
  let raw: string
  if (strategy.attr) {
    raw = el.getAttribute(strategy.attr) ?? ''
  } else {
    raw = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
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

function applyField(
  doc: Document,
  field: FieldSelector,
  baseUrl: string | undefined,
): { value: unknown; warning: string | null } {
  for (const strategy of field.strategies) {
    const raw = resolveStrategy(doc, strategy)
    const cleaned = raw
      .map((v) => applyTransform(v, field.transform, baseUrl))
      .filter((v) => v && v.length > 0)
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
