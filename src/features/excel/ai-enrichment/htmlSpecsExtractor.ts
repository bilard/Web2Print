/**
 * Extrait specs + documents PDF depuis du HTML capturé (DOMParser).
 * Miroir de l'algo injecté dans Jina (`EXPAND_ACCORDIONS_SCRIPT`), mais
 * exécuté localement — utile quand le POST Jina échoue (CORS) et que seul
 * GET browser est disponible, retournant le HTML rendu sans exécuter notre
 * script d'injection.
 *
 * Avantage clé : DOMParser ignore CSS → les panels `display:none` sont
 * parcourus de toute façon. Pas besoin de "révéler" quoi que ce soit.
 */

const SKIP_TAGS = new Set(['TABLE', 'DL', 'TR', 'THEAD', 'TBODY', 'TFOOT', 'SCRIPT', 'STYLE', 'NOSCRIPT'])
const GENERIC_DOC_LABEL = /^(pdf|download|t[eé]l[eé]charger|voir|view|open|ouvrir|link|file|document)\.?$/i

function nearestHeading(el: Element): string {
  let cur: Element | null = el
  for (let i = 0; i < 4 && cur; i++) {
    let sib = cur.previousElementSibling
    while (sib) {
      if (/^H[1-6]$/.test(sib.tagName)) {
        const t = (sib.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (t && t.length <= 80) return t
      }
      sib = sib.previousElementSibling
    }
    cur = cur.parentElement
  }
  return ''
}

function isJunkContext(el: Element): boolean {
  let cur: Element | null = el
  while (cur && cur.tagName !== 'BODY') {
    const tag = cur.tagName
    if (tag === 'NAV' || tag === 'HEADER' || tag === 'FOOTER') return true
    const cls = `${cur.className || ''} ${cur.id || ''}`
    if (typeof cls === 'string' && /cookie|consent|gdpr|mega-?menu|navigation|breadcrumb|footer|cart|panier|newsletter|social/i.test(cls)) return true
    cur = cur.parentElement
  }
  return false
}

function extractPairFromRow(row: Element): [string, string] | null {
  // Un "enfant significatif" a soit du texte, soit une icône check/svg
  // (les valeurs booléennes sont souvent rendues en icône sans texte).
  const hasContent = (e: Element): boolean =>
    (e.textContent ?? '').trim().length > 0 ||
    !!e.querySelector('svg,[class*="check" i],[class*="tick" i]')

  // Déballer les wrappers à enfant unique (Makita <div.techspecs--row> →
  // <div.techspecs-content-inner> → <li> → 2 divs label/value).
  let cur: Element = row
  for (let u = 0; u < 6; u++) {
    const ch = Array.from(cur.children).filter(hasContent)
    if (ch.length >= 2) break
    if (ch.length === 1) { cur = ch[0]; continue }
    break
  }
  const subs = Array.from(cur.children).filter(hasContent)
  if (subs.length >= 2) {
    const k = (subs[0].textContent ?? '').replace(/\s+/g, ' ').trim()
    let v = (subs[1].textContent ?? '').replace(/\s+/g, ' ').trim()
    if (!v && subs[1].querySelector('svg,[class*="check"]')) v = 'Oui'
    if (k && v && k !== v && k.length <= 80 && v.length <= 200) return [k, v]
  }
  const flat = (row.textContent ?? '').replace(/\s+/g, ' ').trim()
  const m = flat.match(/^([^:：]{2,60})\s*[:：]\s*(.{1,200})$/)
  if (m) return [m[1].trim(), m[2].trim()]
  return null
}

function scanContainer(el: Element, checkJunk: boolean): Array<[string, string]> | null {
  if (SKIP_TAGS.has(el.tagName)) return null
  if (checkJunk && isJunkContext(el)) return null
  const kids = el.children
  if (!kids || kids.length < 2 || kids.length > 80) return null
  const pairs: Array<[string, string]> = []
  for (let i = 0; i < kids.length; i++) {
    const p = extractPairFromRow(kids[i])
    if (p) pairs.push(p)
  }
  if (pairs.length < 2 || pairs.length / kids.length < 0.5) return null
  return pairs
}

export function extractSpecsBlockFromHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const seenPairs = new Set<string>()
  let out = ''

  // Tables 2-colonnes
  doc.querySelectorAll('table').forEach(tbl => {
    if (isJunkContext(tbl)) return
    const rows = tbl.querySelectorAll('tr')
    if (rows.length < 2) return
    const localPairs: string[] = []
    rows.forEach(tr => {
      const cells = tr.querySelectorAll('td,th')
      if (cells.length < 2) return
      const k = (cells[0].textContent ?? '').replace(/\s+/g, ' ').trim()
      let v = (cells[1].textContent ?? '').replace(/\s+/g, ' ').trim()
      if (!v && cells[1].querySelector('[class*="check"],svg')) v = 'Oui'
      if (!k || !v || k === v || k.length > 80 || v.length > 200) return
      const pk = k.toLowerCase()
      if (seenPairs.has(pk)) return
      seenPairs.add(pk)
      localPairs.push(`${k} = ${v}`)
    })
    if (localPairs.length >= 2) {
      const cap = tbl.querySelector('caption')
      const title = (cap?.textContent ?? '').trim() || nearestHeading(tbl) || 'Spécifications'
      out += `GROUP: ${title}\n${localPairs.join('\n')}\n`
    }
  })

  // <dl>
  doc.querySelectorAll('dl').forEach(dl => {
    if (isJunkContext(dl)) return
    const dts = dl.querySelectorAll('dt')
    const dds = dl.querySelectorAll('dd')
    if (dts.length < 2 || dts.length !== dds.length) return
    const localPairs: string[] = []
    for (let i = 0; i < dts.length; i++) {
      const k = (dts[i].textContent ?? '').replace(/\s+/g, ' ').trim()
      const v = (dds[i].textContent ?? '').replace(/\s+/g, ' ').trim()
      if (!k || !v || k.length > 80 || v.length > 200) continue
      const pk = k.toLowerCase()
      if (seenPairs.has(pk)) continue
      seenPairs.add(pk)
      localPairs.push(`${k} = ${v}`)
    }
    if (localPairs.length >= 2) {
      const title = nearestHeading(dl) || 'Spécifications'
      out += `GROUP: ${title}\n${localPairs.join('\n')}\n`
    }
  })

  // Pre-scan prioritaire : conteneurs nommés "spec/tech/caracteristic/features"
  const priority = doc.querySelectorAll(
    '[class*="techspec" i],[class*="tech-spec" i],[class*="specification" i],[class*="product-spec" i],' +
    '[class*="caracteris" i],[class*="features-list" i],[class*="attributes" i],[id*="specification" i],' +
    '[id*="techspec" i],[id*="caracteris" i],[class*="datasheet" i]'
  )
  let priorityHit = false
  priority.forEach(el => {
    const pairs = scanContainer(el, false)
    if (!pairs) return
    priorityHit = true
    const localPairs: string[] = []
    for (const [k, v] of pairs) {
      const pk = k.toLowerCase()
      if (seenPairs.has(pk)) continue
      seenPairs.add(pk)
      localPairs.push(`${k} = ${v}`)
    }
    if (localPairs.length >= 2) {
      const title = nearestHeading(el) || 'Caractéristiques techniques'
      out += `GROUP: ${title}\n${localPairs.join('\n')}\n`
    }
  })

  // Générique uniquement si pre-scan sec
  if (!priorityHit) {
    doc.querySelectorAll('body *').forEach(el => {
      const pairs = scanContainer(el, true)
      if (!pairs || pairs.length < 3) return
      const localPairs: string[] = []
      for (const [k, v] of pairs) {
        const pk = k.toLowerCase()
        if (seenPairs.has(pk)) continue
        seenPairs.add(pk)
        localPairs.push(`${k} = ${v}`)
      }
      if (localPairs.length >= 3) {
        const title = nearestHeading(el) || 'Spécifications'
        out += `GROUP: ${title}\n${localPairs.join('\n')}\n`
      }
    })
  }

  if (!out) return ''
  return `JINA_EXTRACTED_SPECS_START\n${out}JINA_EXTRACTED_SPECS_END`
}

export function extractDocumentsBlockFromHtml(html: string, baseUrl?: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const docs: string[] = []
  const seen = new Set<string>()

  function labelForAnchor(a: Element, resolvedUrl: string): string {
    let cur: Element | null = a.parentElement
    for (let d = 0; d < 5 && cur; d++) {
      const tag = cur.tagName
      if (tag === 'BODY' || tag === 'HTML' || tag === 'MAIN' || tag === 'SECTION' || tag === 'ARTICLE') break
      const clone = cur.cloneNode(true) as Element
      clone.querySelectorAll('a, button, img, svg, script, style, noscript').forEach(e => e.remove())
      const parentTxt = (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (parentTxt && parentTxt.length >= 5 && parentTxt.length <= 200 && !GENERIC_DOC_LABEL.test(parentTxt)) return parentTxt
      cur = cur.parentElement
    }
    const txt = (a.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (txt && !GENERIC_DOC_LABEL.test(txt) && txt.length <= 200) return txt
    const aria = a.getAttribute('aria-label') ?? ''
    if (aria && !GENERIC_DOC_LABEL.test(aria)) return aria.trim()
    const title = a.getAttribute('title') ?? ''
    if (title && !GENERIC_DOC_LABEL.test(title)) return title.trim()
    try {
      const u = new URL(resolvedUrl)
      const fn = u.pathname.split('/').pop() ?? ''
      return decodeURIComponent(fn.replace(/\.pdf$/i, '')).replace(/[_-]+/g, ' ').trim() || 'Document'
    } catch { return 'Document' }
  }

  doc.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href') ?? ''
    if (!href) return
    let url: string
    try { url = baseUrl ? new URL(href, baseUrl).toString() : href } catch { return }
    if (!/\.pdf($|\?|#)/i.test(url)) return
    if (seen.has(url)) return
    seen.add(url)
    const label = labelForAnchor(a, url)
    docs.push(`${label} | ${url}`)
  })

  if (docs.length === 0) return ''
  return `JINA_EXTRACTED_DOCUMENTS_START\n${docs.join('\n')}\nJINA_EXTRACTED_DOCUMENTS_END`
}
