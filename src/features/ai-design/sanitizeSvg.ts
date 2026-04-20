/**
 * Assainit un SVG reçu d'un LLM avant injection dans le DOM / parser Fabric.
 *
 * Stratégie conservative :
 *  - Parse DOM via DOMParser (browser-native, même contexte que Fabric)
 *  - Whitelist de tags SVG autorisés
 *  - Whitelist d'attributs (tout `on*` retiré, `style` filtré sur javascript:/expression)
 *  - Whitelist de protocoles pour `href` / `xlink:href` : data:, placeholder:, # (ancre interne)
 */

const ALLOWED_TAGS = new Set([
  'svg', 'g', 'defs', 'title', 'desc',
  'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path',
  'text', 'tspan', 'textPath',
  'image',
  'linearGradient', 'radialGradient', 'stop',
  'pattern', 'mask', 'clipPath', 'filter',
  'feGaussianBlur', 'feOffset', 'feMerge', 'feMergeNode', 'feFlood',
  'feComposite', 'feColorMatrix', 'feBlend', 'feDropShadow',
  'use', 'symbol', 'marker',
])

const ALLOWED_HREF_PROTOCOLS = /^(data:|placeholder:|#)/i

function isSafeHref(value: string): boolean {
  if (!value) return false
  return ALLOWED_HREF_PROTOCOLS.test(value.trim())
}

function sanitizeElement(el: Element): void {
  const children = Array.from(el.children)
  for (const child of children) {
    if (!ALLOWED_TAGS.has(child.tagName.toLowerCase())) {
      child.remove()
      continue
    }
    sanitizeElement(child)
  }

  const attrs = Array.from(el.attributes)
  for (const attr of attrs) {
    const name = attr.name.toLowerCase()
    const value = attr.value

    if (name.startsWith('on')) {
      el.removeAttribute(attr.name)
      continue
    }

    if (name === 'href' || name === 'xlink:href') {
      if (!isSafeHref(value)) {
        el.removeAttribute(attr.name)
      }
      continue
    }

    if (name === 'style' && /javascript:|expression\s*\(/i.test(value)) {
      el.removeAttribute(attr.name)
    }
  }
}

export function sanitizeSvg(svgText: string): string {
  if (typeof svgText !== 'string' || !svgText.trim()) {
    throw new Error('SVG vide ou invalide')
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(svgText, 'image/svg+xml')

  const parserError = doc.querySelector('parsererror')
  if (parserError) {
    throw new Error(`SVG malformé : ${parserError.textContent?.slice(0, 200) ?? 'inconnu'}`)
  }

  const root = doc.documentElement
  if (!root || root.tagName.toLowerCase() !== 'svg') {
    throw new Error('Racine du document n\'est pas <svg>')
  }

  sanitizeElement(root)

  return new XMLSerializer().serializeToString(doc)
}
