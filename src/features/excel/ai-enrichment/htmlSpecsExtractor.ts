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
const GENERIC_DOC_LABEL = /^(pdf|download|t[eé]l[eé]charger|voir|view|open|ouvrir|link|file|document|generate|index|get|fetch|asset|content|resource|uploads?)\.?$/i

/** Labels de raccourcis clavier / contrôles player vidéo rencontrés sur
 *  YouTube, Vimeo, JW Player, Kaltura, Wistia… Pattern universel, s'applique
 *  quel que soit le site produit (Bosch, Décathlon, Leroy Merlin…). */
const VIDEO_PLAYER_SHORTCUT = /^(play\/?pause|lecture\/?pause|shortcuts?|raccourcis?|plein[-\s]?[eé]cran|fullscreen|muet|mute|volume|sous-?titres?|captions?|avancer|reculer|augmenter|diminuer|ouvrir\/?fermer|open\/?close|rewind|forward)\b/i

/** Valeurs purement "décoratives" (touches clavier) qui trahissent un
 *  raccourci vidéo même quand le label passe à travers les autres filtres. */
const VIDEO_PLAYER_KEY_VALUE = /^(espace|space|↑|↓|←|→|esc|enter|tab|shift|ctrl|alt|[a-z]|[0-9]|[a-z]\s*\/\s*[a-z])$/i

/** Libellés d'onglets / sections / CTAs qui ressemblent à des specs quand
 *  une zone résumé produit a une structure 2-colonnes avec icônes check
 *  (Milwaukee, Leroy Merlin, etc.). Miroir de postProcess.UI_LABEL_KEY_RE.
 *  Utilisé pour rejeter une table entière dont toutes les clés sont des
 *  titres d'onglets — faux-positif produit par isVariantTable + checkmarks. */
const UI_TAB_LABEL_RE = /^(documents?|t[eé]l[eé]chargements?|downloads?|sp[eé]cifications?|specs?|inclus|included|accessoires?|accessories|avis|reviews?|notes?(?:\s*[&et]+\s*avis)?|o[uù]\s*acheter|where\s*to\s*buy|services?|support|garantie|warranty|videos?|vid[eé]os?|galerie|gallery|questions?|faq|contact)$/i

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
    if (typeof cls === 'string' && /cookie|consent|gdpr|mega-?menu|navigation|breadcrumb|footer|cart|panier|newsletter|social|video-?player|player|youtube|vimeo|jw-?player|kaltura|wistia|media-?player/i.test(cls)) return true
    cur = cur.parentElement
  }
  return false
}

function isVideoShortcut(k: string, v: string): boolean {
  if (VIDEO_PLAYER_SHORTCUT.test(k)) return true
  // Label court + valeur = touche clavier isolée → raccourci
  if (k.length <= 30 && VIDEO_PLAYER_KEY_VALUE.test(v)) return true
  return false
}

// Paires à rejeter : documents (label | Télécharger), codes produit,
// valeurs génériques qui n'apportent rien.
const DOC_VALUE_RE = /^(t[eé]l[eé]charger|download|pdf|voir|view)\.?$/i
const FILENAME_KEY_RE = /^[a-z0-9._-]+\.(pdf|docx?|xlsx?|zip)$/i
const PRODUCT_CODE_RE_GLOBAL = /^[A-Z][A-Z0-9]{3,}[A-Z0-9]$/

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
    if (k && v && k !== v && k.length <= 80 && v.length <= 200 && !isVideoShortcut(k, v)) {
      if (DOC_VALUE_RE.test(v)) return null
      if (FILENAME_KEY_RE.test(k)) return null
      if (PRODUCT_CODE_RE_GLOBAL.test(k)) return null
      return [k, v]
    }
  }
  const flat = (row.textContent ?? '').replace(/\s+/g, ' ').trim()
  const m = flat.match(/^([^:：]{2,60})\s*[:：]\s*(.{1,200})$/)
  if (m) {
    const k = m[1].trim(), v = m[2].trim()
    if (isVideoShortcut(k, v)) return null
    if (DOC_VALUE_RE.test(v)) return null
    if (FILENAME_KEY_RE.test(k)) return null
    if (PRODUCT_CODE_RE_GLOBAL.test(k)) return null
    return [k, v]
  }
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

  // Détecte un tableau de variantes (dont le header contient Réf./Ref/SKU/Code)
  // ou dont la 1re colonne ressemble à des codes produit (ALPHA+digits, 5+ chars).
  // Ces tableaux ne sont PAS des specs techniques → on les exclut.
  const VARIANT_HEADER_RE = /^(r[eé]f\.?|ref[eé]rence|sku|code(\s*(produit|article|ean))?|gencod|ean|gtin)$/i
  const PRODUCT_CODE_RE = /^[A-Z][A-Z0-9]{3,}[A-Z0-9]$/
  function isVariantTable(tbl: Element): boolean {
    const rows = tbl.querySelectorAll('tr')
    if (rows.length < 2) return false
    const headerCells = rows[0].querySelectorAll('td,th')
    if (headerCells.length >= 2) {
      const h0 = (headerCells[0].textContent ?? '').replace(/\s+/g, ' ').trim()
      if (VARIANT_HEADER_RE.test(h0)) return true
    }
    // 1re cellule des 2-3 premières lignes data : si codes produit (DR100CH, PR102CH…)
    let codeHits = 0
    for (let i = 1; i < Math.min(rows.length, 4); i++) {
      const cells = rows[i].querySelectorAll('td,th')
      if (cells.length < 2) continue
      const k = (cells[0].textContent ?? '').replace(/\s+/g, ' ').trim()
      // Retirer préfixe "Réf." si collé devant le code (responsive mobile label)
      const kClean = k.replace(/^(r[eé]f\.?|ref[eé]rence|sku|code)\s*/i, '').trim()
      if (PRODUCT_CODE_RE.test(kClean)) codeHits++
    }
    return codeHits >= 2
  }
  // Si une cellule contient un span mobile-hidden avec le label de colonne puis
  // la valeur (ex: "Réf.DR100CH"), on retire le préfixe correspondant au header.
  function stripMobileLabel(raw: string, headerText: string): string {
    if (!headerText) return raw
    const h = headerText.replace(/\s+/g, ' ').trim()
    if (!h || h.length > 40) return raw
    // Escape regex
    const esc = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`^${esc}\\s*`, 'i')
    return raw.replace(re, '').trim()
  }

  // Tables 2-colonnes (specs only — on exclut les tables de variantes)
  doc.querySelectorAll('table').forEach(tbl => {
    if (isJunkContext(tbl)) return
    if (isVariantTable(tbl)) return
    const rows = tbl.querySelectorAll('tr')
    if (rows.length < 2) return
    // Récupérer les headers pour strip mobile-label
    const headerCells = rows[0].querySelectorAll('td,th')
    const h0 = headerCells.length >= 1 ? (headerCells[0].textContent ?? '').replace(/\s+/g, ' ').trim() : ''
    const h1 = headerCells.length >= 2 ? (headerCells[1].textContent ?? '').replace(/\s+/g, ' ').trim() : ''
    const localPairs: string[] = []
    rows.forEach((tr, rowIdx) => {
      // Skip la 1re ligne seulement si c'est un VRAI header de colonnes :
      //   - toutes les cellules sont <th> (header complet), OU
      //   - h0 est un intitulé de colonne générique (Ref/Libellé/Nom/…).
      // Une ligne <th>label</th><td>valeur</td> est un libellé de ligne
      // (ex: Kärcher "Tension (V) | 220 - 240"), PAS un header → on garde.
      if (rowIdx === 0) {
        const cellsRow0 = tr.querySelectorAll('td,th')
        const thCount = tr.querySelectorAll('th').length
        const allTh = cellsRow0.length >= 2 && thCount === cellsRow0.length
        const headerLabel = /^(r[eé]f\.?|libell[eé]|nom|description|d[eé]signation|caract[eé]ristiques?|propri[eé]t[eé]s?|attribut|param[eè]tre)$/i.test(h0)
        if (allTh || headerLabel) return
      }
      const cells = tr.querySelectorAll('td,th')
      if (cells.length < 2) return
      let k = (cells[0].textContent ?? '').replace(/\s+/g, ' ').trim()
      let v = (cells[1].textContent ?? '').replace(/\s+/g, ' ').trim()
      k = stripMobileLabel(k, h0)
      v = stripMobileLabel(v, h1)
      if (!v && cells[1].querySelector('[class*="check"],svg')) v = 'Oui'
      if (!k || !v || k === v || k.length > 80 || v.length > 200) return
      if (isVideoShortcut(k, v)) return
      // Rejet : paire où la valeur est un code produit / où la clé est un header brut
      if (PRODUCT_CODE_RE.test(k)) return
      if (VARIANT_HEADER_RE.test(k) && VARIANT_HEADER_RE.test(v)) return
      const pk = k.toLowerCase()
      if (seenPairs.has(pk)) return
      seenPairs.add(pk)
      localPairs.push(`${k} = ${v}`)
    })
    if (localPairs.length >= 2) {
      // Rejet : table dont TOUTES les clés sont des libellés d'onglets UI
      // (Milwaukee : "Spécifications/Inclus/NOTES & AVIS/Téléchargements" avec
      // icônes check). Les vraies tables specs ont des clés techniques.
      const allUiLabels = localPairs.every(p => {
        const k = p.split(' = ')[0]
        return UI_TAB_LABEL_RE.test(k)
      })
      if (allUiLabels) {
        localPairs.forEach(p => seenPairs.delete(p.split(' = ')[0].toLowerCase()))
        return
      }
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
      if (isVideoShortcut(k, v)) continue
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

  const HEADING_SEL = 'h1,h2,h3,h4,h5,h6,strong,b,[class*="title" i],[class*="heading" i],[class*="name" i],[class*="label" i]'
  const SKU_ONLY_RE = /^[0-9]{4,}$/
  const SKU_LINE_RE = /^(ref|r[eé]f[eé]rence|sku|code)\s*[:#]?\s*[0-9a-z-]{4,}$/i

  function cleanLabel(raw: string): string {
    const lines = raw
      .split(/\n+/)
      .map(l => l.replace(/\s+/g, ' ').trim())
      .filter(l => l && !SKU_ONLY_RE.test(l) && !SKU_LINE_RE.test(l))
    return lines[0] ?? ''
  }
  function isGoodLabel(t: string): boolean {
    if (!t || t.length < 3 || t.length > 200) return false
    if (GENERIC_DOC_LABEL.test(t)) return false
    if (SKU_ONLY_RE.test(t)) return false
    return true
  }
  /** Trouve le heading le plus proche de `a` dans `container` (ancêtre).
   *  Priorité : (1) heading CONTENU dans `a`, (2) heading qui PRÉCÈDE `a` en
   *  ordre document (le plus proche = le dernier preceding), (3) heading unique. */
  function findNearestHeading(a: Element, container: Element): Element | null {
    const all = Array.from(container.querySelectorAll(HEADING_SEL))
    if (all.length === 0) return null
    if (all.length === 1) return all[0]
    let insideA: Element | null = null
    let lastPreceding: Element | null = null
    for (const h of all) {
      const pos = a.compareDocumentPosition(h)
      // eslint-disable-next-line no-bitwise
      if (pos & Node.DOCUMENT_POSITION_CONTAINED_BY) { insideA = h; continue }
      // eslint-disable-next-line no-bitwise
      if (pos & Node.DOCUMENT_POSITION_CONTAINS) continue
      // eslint-disable-next-line no-bitwise
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) lastPreceding = h
    }
    return insideA ?? lastPreceding ?? all[0]
  }
  function labelForAnchor(a: Element, resolvedUrl: string): string {
    // 0) aria-labelledby → lookup élément référencé
    const labelledById = (a.getAttribute('aria-labelledby') ?? '').split(/\s+/)[0]
    if (labelledById) {
      const ref = (a.ownerDocument ?? doc).getElementById(labelledById)
      if (ref) {
        const t = cleanLabel(ref.textContent ?? '')
        if (isGoodLabel(t)) return t
      }
    }
    // 1) Attributs data-* explicites
    for (const attr of ['data-title', 'data-name', 'data-file-title', 'data-document-name', 'data-label']) {
      const v = a.getAttribute(attr) ?? ''
      const t = cleanLabel(v)
      if (isGoodLabel(t)) return t
    }
    // 2) Texte du <a> lui-même (cleanLabel retire les lignes SKU)
    const aText = cleanLabel(a.textContent ?? '')
    if (isGoodLabel(aText)) return aText
    // 3) Walk up : chercher heading le plus proche de `a` dans chaque ancêtre
    let cur: Element | null = a.parentElement
    for (let d = 0; d < 5 && cur; d++) {
      const tag = cur.tagName
      if (tag === 'BODY' || tag === 'HTML' || tag === 'MAIN') break
      const h = findNearestHeading(a, cur)
      if (h) {
        const t = cleanLabel(h.textContent ?? '')
        if (isGoodLabel(t)) return t
      }
      // Fallback : texte propre du parent (1re ligne non-SKU, conteneur serré)
      const clone = cur.cloneNode(true) as Element
      clone.querySelectorAll('a, button, img, svg, script, style, noscript').forEach(e => e.remove())
      const parentTxt = cleanLabel(clone.textContent ?? '')
      if (parentTxt && parentTxt.length >= 5 && parentTxt.length <= 120 && isGoodLabel(parentTxt)) return parentTxt
      cur = cur.parentElement
    }
    // 4) aria-label / title
    const aria = a.getAttribute('aria-label') ?? ''
    const ariaClean = cleanLabel(aria)
    if (isGoodLabel(ariaClean)) return ariaClean
    const titleAttr = a.getAttribute('title') ?? ''
    const titleClean = cleanLabel(titleAttr)
    if (isGoodLabel(titleClean)) return titleClean
    // 5) URL : d'abord query params nommés (type/name/file/doc/title/format),
    //    puis filename. Rejeter les noms d'endpoints génériques.
    try {
      const u = new URL(resolvedUrl)
      for (const [k, v] of u.searchParams) {
        if (!/^(type|name|file|doc|title|format|label|nom)$/i.test(k)) continue
        const cleaned = decodeURIComponent(v.replace(/\.pdf$/i, '')).replace(/[_-]+/g, ' ').trim()
        if (isGoodLabel(cleaned)) return cleaned
      }
      const fn = u.pathname.split('/').pop() ?? ''
      const cleaned = decodeURIComponent(fn.replace(/\.pdf$/i, '')).replace(/[_-]+/g, ' ').trim()
      if (isGoodLabel(cleaned)) return cleaned
    } catch { /* noop */ }
    return 'Document'
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
